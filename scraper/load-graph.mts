// Loads the catalog into Neo4j. Safe to run again: everything is merged, nothing is duplicated.
// Needs NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in .env.local.
// Run: npm run graph

import { readFileSync } from "node:fs";
import { CREATORS, LOOKS } from "../lib/creators";
import { productsFor } from "../lib/feed";
import { attributeTags, graphDriver, NEEDS } from "../lib/graph";
import { GUIDE } from "../lib/guide";
import type { Attributes } from "../lib/suit";

type Offer = { seller: string; sellerName: string; priceEur: number };
type Product = { id: string; brand: string; title: string; type: string; group: string; offers: Offer[] };

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const { products } = read("../data/catalog.json") as { products: Product[] };
const attributes = read("../data/attributes.json") as Record<string, Attributes>;
const matches = read("../data/matches.json") as {
  cheaper: Record<string, { id: string; deltaE: number; saveEur: number }[]>;
  families: { id: string; name: string; group: string; products: string[] }[];
};

const db = graphDriver();
if (!db) throw new Error("Set NEO4J_URI and NEO4J_PASSWORD in .env.local first");

// Each MERGE below looks nodes up by these keys, so the constraints make loading fast as well as safe.
const CONSTRAINTS = [
  ["product_id", "Product", "id"],
  ["attribute_name", "Attribute", "name"],
  ["trait_name", "Trait", "name"],
  ["seller_id", "Seller", "id"],
  ["creator_id", "Creator", "id"],
  ["look_id", "Look", "id"],
  ["family_id", "Family", "id"],
  ["guide_id", "Guide", "id"],
  ["stat_id", "Stat", "id"],
];
for (const [name, label, key] of CONSTRAINTS) {
  await db.executeQuery(`CREATE CONSTRAINT ${name} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${key} IS UNIQUE`);
}
await db.executeQuery("CREATE INDEX product_type IF NOT EXISTS FOR (p:Product) ON (p.type)");

const rows = products.map((p) => ({
  id: p.id,
  brand: p.brand,
  title: p.title,
  type: p.type,
  group: p.group,
  tags: attributeTags(attributes[p.id]),
  offers: p.offers.map((o) => ({ seller: o.seller, name: o.sellerName, price: o.priceEur })),
}));

const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
  await db.executeQuery(
    `UNWIND $rows AS row
     MERGE (p:Product {id: row.id})
     SET p.brand = row.brand, p.title = row.title, p.type = row.type, p.group = row.group
     WITH p, row
     CALL (p) {
       MATCH (p)-[old:HAS|SOLD_BY]->()
       DELETE old
     }
     WITH p, row
     CALL (p, row) {
       UNWIND row.tags AS tag
       MERGE (a:Attribute {name: tag})
       MERGE (p)-[:HAS]->(a)
     }
     WITH p, row
     CALL (p, row) {
       UNWIND row.offers AS offer
       MERGE (s:Seller {id: offer.seller}) SET s.name = offer.name
       MERGE (p)-[r:SOLD_BY]->(s) SET r.priceEur = offer.price
     }`,
    { rows: rows.slice(i, i + BATCH) },
  );
  console.log(`${Math.min(i + BATCH, rows.length)}/${rows.length} products`);
}

// Products dropped from the catalog must leave the graph too.
await db.executeQuery("MATCH (p:Product) WHERE NOT p.id IN $ids DETACH DELETE p", { ids: products.map((p) => p.id) });
await db.executeQuery("MATCH (s:Seller) WHERE NOT (s)<-[:SOLD_BY]-() DETACH DELETE s");

// Learned NEEDS weights stay untouched on a reload: ON CREATE only sets the starting value.
await db.executeQuery(
  `UNWIND $needs AS need
   MERGE (t:Trait {name: need[0]})
   MERGE (a:Attribute {name: need[1]})
   MERGE (t)-[n:NEEDS]->(a)
   ON CREATE SET n.weight = toFloat(need[2])`,
  { needs: NEEDS },
);

await db.executeQuery("MATCH (l:Look) WHERE NOT l.id IN $ids DETACH DELETE l", { ids: LOOKS.map((l) => l.id) });
await db.executeQuery("MATCH (c:Creator) WHERE NOT c.id IN $ids DETACH DELETE c", { ids: LOOKS.map((l) => l.creatorId) });
await db.executeQuery("MATCH (:Look)-[r:USES]->() DELETE r");

await db.executeQuery(
  `UNWIND $looks AS look
   MERGE (c:Creator {id: look.creatorId}) SET c.name = look.creator, c.sample = true
   MERGE (l:Look {id: look.id}) SET l.name = look.name
   MERGE (c)-[:MADE]->(l)
   WITH l, look
   UNWIND look.products AS id
   MATCH (p:Product {id: id})
   MERGE (l)-[:USES]->(p)`,
  {
    looks: LOOKS.map((l) => ({
      id: l.id,
      name: l.name,
      creatorId: l.creatorId,
      creator: CREATORS.find((c) => c.id === l.creatorId)!.name,
      products: productsFor(l).map((p) => p.id),
    })),
  },
);

await db.executeQuery("MATCH ()-[r:SAME_COLOUR_AS]->() DELETE r");

await db.executeQuery(
  `UNWIND $pairs AS pair
   MATCH (a:Product {id: pair.from}), (b:Product {id: pair.to})
   MERGE (a)-[r:SAME_COLOUR_AS]->(b)
   SET r.deltaE = pair.deltaE, r.saveEur = pair.saveEur`,
  { pairs: Object.entries(matches.cheaper).flatMap(([from, list]) => list.map((m) => ({ from, to: m.id, deltaE: m.deltaE, saveEur: m.saveEur }))) },
);

await db.executeQuery("MATCH (f:Family) WHERE NOT f.id IN $ids DETACH DELETE f", { ids: matches.families.map((f) => f.id) });
await db.executeQuery("MATCH ()-[r:IN_FAMILY]->() DELETE r");

await db.executeQuery(
  `UNWIND $families AS family
   MERGE (f:Family {id: family.id}) SET f.name = family.name, f.group = family.group
   WITH f, family
   UNWIND family.products AS id
   MATCH (p:Product {id: id})
   MERGE (p)-[:IN_FAMILY]->(f)`,
  { families: matches.families },
);

await db.executeQuery(
  `UNWIND $rules AS rule
   MERGE (t:Trait {name: rule.trait})
   MERGE (g:Guide {id: rule.id}) SET g.title = rule.title, g.advice = rule.advice
   MERGE (t)-[:GUIDED_BY]->(g)`,
  { rules: GUIDE.map(({ id, trait, title, advice }) => ({ id, trait, title, advice })) },
);

const nodes = await db.executeQuery("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS total ORDER BY total DESC");
for (const r of nodes.records) console.log(r.get("label"), r.get("total").toString());
const links = await db.executeQuery("MATCH ()-[r]->() RETURN type(r) AS label, count(*) AS total ORDER BY total DESC");
for (const r of links.records) console.log(r.get("label"), r.get("total").toString());
await db.close();
