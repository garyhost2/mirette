import { NextResponse } from "next/server";
import attributes from "@/data/attributes.json";
import { traitTags, traitsOf } from "@/lib/engine";
import { attributeTags, nudgeGraph } from "@/lib/graph";
import { EVENT_VALUE, EVENT_WEIGHT, update, type EventKind, type Signals } from "@/lib/learn";
import { allow, visitorOf } from "@/lib/rate-limit";
import { model } from "@/lib/recommend";
import type { Attributes } from "@/lib/suit";
import { isFace, isSignals } from "@/lib/validate";

type Body = { kind?: unknown; productId?: unknown; face?: unknown; signals?: unknown };

const EVENTS_PER_MINUTE = 60;
const NEUTRAL: Signals = { optical: 0.5, physical: 0.5, creator: 0.5, graph: 0.5, popularity: 0.3 };
const allAttributes = attributes as Record<string, Attributes>;

const isKind = (value: unknown): value is EventKind => typeof value === "string" && Object.hasOwn(EVENT_VALUE, value);
const isProduct = (value: unknown): value is string => typeof value === "string" && Object.hasOwn(allAttributes, value);

/** One shopper action moves the model and the graph a little, so real behaviour replaces the simulation. */
export async function POST(request: Request) {
  const { kind, productId, face, signals } = (await request.json().catch(() => ({}))) as Body;
  if (!isKind(kind) || !isProduct(productId) || !isFace(face)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  if (signals !== undefined && !isSignals(signals)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  if (!allow(`events:${visitorOf(request)}`, EVENTS_PER_MINUTE, 60 * 1000)) return NextResponse.json({ error: "Too many events" }, { status: 429 });

  const traits = traitTags(traitsOf(face));
  const tags = attributeTags(allAttributes[productId]);
  update(model, signals ?? NEUTRAL, traits, tags, kind);
  await nudgeGraph(traits, tags, (EVENT_VALUE[kind] - 0.5) * EVENT_WEIGHT[kind] * 0.02);
  return NextResponse.json({ events: model.events });
}
