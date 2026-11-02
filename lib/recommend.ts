// What the app asks the engine: for this face, which products, which shades and which creators.

import attributes from "@/data/attributes.json";
import catalog from "@/data/catalog.json";
import savedModel from "@/data/model.json";
import { CREATORS, LOOKS, SAMPLES, creatorOf, faceOfCreator } from "./creators";
import { deltaE } from "./color";
import { fit, traitTags, traitsOf, type EngineProduct, type Fit } from "./engine";
import { TRAIT_LABEL, type Face } from "./face";
import { attributeTags, databaseEventCount, databaseGraphScores, hasGraphDatabase, localGraphScore, NEEDS } from "./graph";
import { strongestPairs, type Model } from "./learn";
import { kindOfLook, matchLook } from "./match";
import { effectGap, effectOn, translate, type Candidate } from "./translate";
import { families, findProduct, productsFor } from "./feed";
import { needsOf } from "./guide";
import type { Attributes } from "./suit";

export const model = savedModel as Model;

/** Trained on simulated shoppers. Real actions are counted apart so the app never mixes them up. */
const SIMULATED_EVENTS = model.events;

const allAttributes = attributes as Record<string, Attributes>;
const products = (catalog.products as unknown as Omit<EngineProduct, "attributes">[]).map((p) => ({ ...p, attributes: allAttributes[p.id] }));

export function matchCreators(face: Face) {
  // A sample face that is itself a creator should not come back as its own closest match.
  const others = LOOKS.filter((look) => creatorOf(look).tone.skin !== face.tone.skin);
  return others.map((look) => {
    const creator = creatorOf(look);
    const types = productsFor(look).map((p) => p.type);
    const result = matchLook(face, faceOfCreator(creator), kindOfLook(types));
    return { creatorId: creator.id, lookId: look.id, name: creator.name, look: look.name, ...result };
  }).sort((a, b) => b.score - a.score);
}

/** Past this gap the catalog has nothing that truly gives the same effect, and the app says so. */
const CLOSE_EFFECT = 6;

/** Real shades of one kind, for look translation. */
const shadesOfType = (type: string): Candidate[] =>
  products
    .filter((p) => p.type === type && p.offers.some((o) => (o as { available?: boolean }).available))
    .flatMap((p) => p.shades.flatMap((s) => (s.hex ? [{ productId: p.id, shade: s.name, hex: s.hex, opacity: p.attributes.opacity }] : [])));

/** Each creator's look, rebuilt with the real shades that give the same effect on this face. */
export function translateLooks(face: Face) {
  const entries = LOOKS.map((look) => {
    const creator = creatorOf(look);
    const from = faceOfCreator(creator);
    const steps = productsFor(look).flatMap((shown) => {
      const source = products.find((p) => p.id === shown.id);
      const own = source && fit(from, source, model);
      if (!source || !own?.hex) return [];
      // The look's signature colour leads. Its other steps start from the creator's best shade.
      const signed = look.signature.type === source.type;
      const hex = signed ? look.signature.hex : own.hex;
      const opacity = signed ? look.signature.opacity : source.attributes.opacity;
      const match = translate(from, face, source.type, hex, opacity, shadesOfType(source.type));
      const product = match && findProduct(match.productId);
      if (!match || !product) return [];
      return [{ productId: product.id, type: product.type, title: product.title, image: product.image, hex: match.hex, url: product.offers[0].url, shade: shownShade(products.find((p) => p.id === match.productId)!, match.shade) }];
    });
    return [look.id, steps] as const;
  });
  return Object.fromEntries(entries);
}

/** One look's main colour on every sample face, to show that the effect holds as the shade changes. */
export function translationTable(lookId: string) {
  const look = LOOKS.find((l) => l.id === lookId);
  if (!look) return null;
  const creator = creatorOf(look);
  const from = faceOfCreator(creator);
  const { type, hex, opacity } = look.signature;
  const wanted = effectOn(from, type, hex, opacity);
  const candidates = shadesOfType(type);
  const rows = SAMPLES.map((sample) => {
    const isSource = sample.face.tone.skin === from.tone.skin;
    if (isSource) return { id: sample.id, photo: sample.photo, isSource, hex, title: "The original", contrast: Math.round(Math.abs(wanted.contrast) * 100), close: true };
    const match = translate(from, sample.face, type, hex, opacity, candidates);
    if (!match) return null;
    const effect = effectOn(sample.face, type, match.hex, match.opacity);
    const product = findProduct(match.productId);
    return {
      id: sample.id,
      photo: sample.photo,
      isSource,
      hex: match.hex,
      title: product?.title ?? "",
      contrast: Math.round(Math.abs(effect.contrast) * 100),
      close: effectGap(wanted, effect) <= CLOSE_EFFECT,
    };
  });
  return { look: look.name, creator: creator.name, rows: rows.filter((r) => r !== null) };
}

/** How many foundation shades in the catalog read as this shopper's own skin. */
export function shadesWithinReach(face: Face) {
  const shades = products.filter((p) => p.type === "foundation").flatMap((p) => p.shades.flatMap((s) => (s.hex ? [s.hex] : [])));
  return { near: shades.filter((hex) => deltaE(hex, face.tone.skin) <= 4).length, total: shades.length };
}

/** A percentage for shoppers: model probabilities are low by nature, so this is rank within the catalog. */
function percentile(fits: Fit[]) {
  const sorted = [...fits].sort((a, b) => a.score - b.score);
  return new Map(sorted.map((f, i) => [f.productId, Math.round(40 + (59 * i) / Math.max(1, sorted.length - 1))]));
}

export async function recommend(face: Face, limit = 40) {
  const traits = traitTags(traitsOf(face));
  const database = await databaseGraphScores(traits);
  const creators = matchCreators(face);

  // A creator's score lifts the products in that creator's looks.
  const creatorSignal = new Map<string, number>();
  for (const c of creators) {
    const look = LOOKS.find((l) => l.id === c.lookId)!;
    for (const p of productsFor(look)) creatorSignal.set(p.id, Math.max(creatorSignal.get(p.id) ?? 0, c.score / 100));
  }

  const fits = products.flatMap(
    (p) =>
      fit(face, p, model, {
        creator: creatorSignal.get(p.id),
        graph: database?.get(p.id) ?? localGraphScore(traits, attributeTags(p.attributes)),
      }) ?? [],
  );
  const percent = percentile(fits);
  const top = [...fits].sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    graph: database ? "neo4j" : "local",
    model: { simulated: SIMULATED_EVENTS, real: (await databaseEventCount()) ?? model.events - SIMULATED_EVENTS },
    traits: traits.map((t) => TRAIT_LABEL[t] ?? t.split(":")[1]),
    needs: needsOf(face, traitsOf(face)),
    creators: creators.slice(0, 3),
    products: top.map((f) => ({ productId: f.productId, shade: f.shade, hex: f.hex, percent: percent.get(f.productId) ?? 0, reasons: f.reasons.slice(0, 2) })),
  };
}

/** Brand-free mode renames shades, so names sent to the app must follow the same order. */
function shownShade(product: EngineProduct, shade: string | null) {
  if (process.env.BRAND_FREE !== "1") return shade;
  const coloured = product.shades.filter((s) => s.hex);
  return `Shade ${coloured.findIndex((s) => s.name === shade) + 1}`;
}

/** The colour families that fit this face best, for the Me screen. */
export function bestFamilies(fits: Record<string, { percent: number }>, count = 3) {
  return families
    .map((f) => {
      const scores = f.products.flatMap((id) => (fits[id] ? [fits[id].percent] : []));
      const percent = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      return { id: f.id, name: f.name, percent, products: f.products.length };
    })
    .sort((a, b) => b.percent - a.percent)
    .slice(0, count);
}

/** Fit of one product, used on its card once a shopper has scanned. */
export function fitsFor(face: Face) {
  const traits = traitTags(traitsOf(face));
  const fits = products.flatMap((p) => fit(face, p, model, { graph: localGraphScore(traits, attributeTags(p.attributes)) }) ?? []);
  const percent = percentile(fits);
  const named = new Map(products.map((p) => [p.id, p]));
  return Object.fromEntries(
    fits.map((f) => [
      f.productId,
      {
        percent: percent.get(f.productId) ?? 0,
        shade: shownShade(named.get(f.productId)!, f.shade),
        hex: f.hex,
        reason: f.reasons[0] ?? null,
        warning: f.warnings[0] ?? null,
      },
    ]),
  );
}

/** The shopper's part of the graph, small enough to draw on the Me screen. */
export function shopperGraph(face: Face) {
  const traits = traitTags(traitsOf(face));
  const links = NEEDS.filter(([trait, , weight]) => traits.includes(trait) && weight > 0);
  const learned = strongestPairs(model, 30).filter((p) => traits.includes(p.trait) && p.weight > 0.35);
  const pairs = new Map<string, { trait: string; attribute: string; weight: number }>();
  for (const [trait, attribute, weight] of links) pairs.set(`${trait}|${attribute}`, { trait, attribute, weight });
  for (const p of learned) pairs.set(`${p.trait}|${p.attribute}`, p);

  const edges = [...pairs.values()].sort((a, b) => b.weight - a.weight).slice(0, 8);
  return {
    source: hasGraphDatabase() ? "neo4j" : "local",
    edges: edges.map((e) => ({
      trait: TRAIT_LABEL[e.trait] ?? e.trait.split(":")[1],
      attribute: e.attribute.split(":")[1],
      weight: e.weight,
      products: products.filter((p) => attributeTags(p.attributes).includes(e.attribute)).length,
    })),
  };
}

export const creatorIds = CREATORS.map((c) => c.id);
