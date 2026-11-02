// The product graph. Neo4j holds it when NEO4J_URI is set. Otherwise the same logic runs here,
// so the app behaves the same with or without the database.
//
//   (Trait)-[:NEEDS {weight}]->(Attribute)<-[:HAS]-(Product)-[:SOLD_BY]->(Seller)
//   (Creator)-[:MADE]->(Look)-[:USES]->(Product)

import neo4j, { type Driver } from "neo4j-driver";
import type { Attributes } from "./suit";

/** Starting links from a face trait to what helps it. Behaviour moves these weights. */
export const NEEDS: [string, string, number][] = [
  ["oily", "finish:matte", 0.8],
  ["oily", "claim:oilfree", 0.7],
  ["oily", "claim:blurring", 0.4],
  ["oily", "finish:dewy", -0.5],
  ["dry", "finish:dewy", 0.7],
  ["dry", "claim:hydrating", 0.8],
  ["dry", "finish:matte", -0.5],
  ["textured", "claim:blurring", 0.8],
  ["textured", "finish:satin", 0.3],
  ["textured", "finish:shimmer", -0.6],
  ["redness", "coverage:medium", 0.4],
  ["redness", "coverage:full", 0.5],
  ["hooded", "claim:waterproof", 0.8],
  ["hooded", "claim:longwear", 0.5],
  ["hooded", "finish:shimmer", -0.3],
  ["thin-lips", "finish:gloss", 0.8],
  ["full-lips", "finish:matte", 0.4],
  ["high-contrast", "finish:matte", 0.2],
  ["low-contrast", "coverage:sheer", 0.4],
  ["shadows", "formula:cream", 0.4],
];

export function attributeTags(a: Attributes): string[] {
  return [
    a.finish && `finish:${a.finish}`,
    a.coverage && `coverage:${a.coverage}`,
    a.formula && `formula:${a.formula}`,
    ...a.claims.map((c) => `claim:${c}`),
  ].filter((t): t is string => !!t);
}

/** 0 to 1, with 0.5 meaning the graph has nothing to say about this pair. */
export function localGraphScore(traits: string[], tags: string[]) {
  let sum = 0;
  for (const [trait, attribute, weight] of NEEDS) {
    if (traits.includes(trait) && tags.includes(attribute)) sum += weight;
  }
  return Math.max(0, Math.min(1, 0.5 + sum / 2));
}

let driver: Driver | null = null;

/** A shopper should never wait on the database: past this, the built-in graph answers instead. */
const PATIENCE_MS = 1500;
/** After a failure the app stops asking for a while, so one outage does not slow every request. */
const REST_MS = 30000;
let restUntil = 0;

export const hasGraphDatabase = () => Boolean(process.env.NEO4J_URI && process.env.NEO4J_PASSWORD);

export function graphDriver() {
  if (!hasGraphDatabase()) return null;
  driver ??= neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USERNAME ?? "neo4j", process.env.NEO4J_PASSWORD!), {
    connectionTimeout: PATIENCE_MS,
    maxTransactionRetryTime: PATIENCE_MS,
  });
  return driver;
}

/** Graph signal for every product at once. Returns null when the database is off or unreachable. */
export async function databaseGraphScores(traits: string[]): Promise<Map<string, number> | null> {
  const db = graphDriver();
  if (!db || Date.now() < restUntil) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = db.executeQuery(
      `MATCH (t:Trait)-[n:NEEDS]->(:Attribute)<-[:HAS]-(p:Product)
       WHERE t.name IN $traits
       RETURN p.id AS id, sum(n.weight) AS weight`,
      { traits },
      { routing: neo4j.routing.READ },
    );
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Neo4j is too slow")), PATIENCE_MS);
    });
    const { records } = await Promise.race([query, late]);
    return new Map(records.map((r) => [r.get("id") as string, Math.max(0, Math.min(1, 0.5 + (r.get("weight") as number) / 2))]));
  } catch {
    restUntil = Date.now() + REST_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Real shopper actions, kept in the database so the count survives a restart. */
export async function databaseEventCount(): Promise<number | null> {
  const db = graphDriver();
  if (!db || Date.now() < restUntil) return null;
  try {
    const { records } = await db.executeQuery("MATCH (s:Stat {id: 'events'}) RETURN s.count AS count", {}, { routing: neo4j.routing.READ });
    return records[0] ? Number(records[0].get("count")) : 0;
  } catch {
    return null;
  }
}

/** Moves one trait's links after a shopper acts, so the database learns from behaviour too. */
export async function nudgeGraph(traits: string[], tags: string[], change: number) {
  const db = graphDriver();
  if (!db || Date.now() < restUntil) return;
  await db.executeQuery("MERGE (s:Stat {id: 'events'}) ON CREATE SET s.count = 0 SET s.count = s.count + 1").catch(() => {});
  await db
    .executeQuery(
      `UNWIND $traits AS trait UNWIND $tags AS tag
       MERGE (t:Trait {name: trait})
       MERGE (a:Attribute {name: tag})
       MERGE (t)-[n:NEEDS]->(a)
       ON CREATE SET n.weight = 0
       SET n.weight = n.weight + $change`,
      { traits, tags, change },
    )
    .catch(() => {});
}
