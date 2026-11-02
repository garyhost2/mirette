// Trains the behaviour model on simulated shoppers, then tests it on shoppers it has never seen.
// Each shopper has hidden tastes the rules do not know. So this shows the engine can learn from
// behaviour. It does not show that the advice is right: only real shoppers can show that.
// Run: npx tsx scraper/simulate.ts

import { readFileSync, writeFileSync } from "node:fs";
import { rgbToHex } from "../lib/color";
import { attributeTags } from "../lib/graph";
import { fit, traitTags, traitsOf, type EngineProduct } from "../lib/engine";
import type { Face } from "../lib/face";
import { RULES_ONLY, strongestPairs, update, type EventKind, type Model } from "../lib/learn";

const SHOPPERS = 900;
const TEST_SHOPPERS = 200;
const SHOWN = 12;
const POOL = 80;

// A fixed seed makes every run give the same numbers.
let state = 20261102;
function random() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo: number, hi: number) => lo + random() * (hi - lo);
const oneOf = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = read("../data/catalog.json");
const attributes = read("../data/attributes.json");

const products: EngineProduct[] = catalog.products
  .map((p: EngineProduct) => ({ ...p, attributes: attributes[p.id] }))
  .filter((p: EngineProduct) => p.shades.some((s) => s.hex));

function simulatedFace(): Face {
  const light = between(0.25, 0.96);
  const warm = between(-0.06, 0.08);
  const skin = rgbToHex(255 * (0.42 + 0.56 * light + warm), 255 * (0.26 + 0.6 * light), 255 * (0.17 + 0.6 * light - warm));
  const hairL = between(0.05, 0.5);
  const hair = rgbToHex(255 * hairL, 255 * hairL * 0.75, 255 * hairL * 0.6);
  return {
    source: "simulated",
    tone: {
      skin,
      hair,
      brow: hair,
      lip: rgbToHex(150 + 70 * light, 70 + 50 * light, 70 + 50 * light),
      eye: oneOf(["#3a2416", "#2c1a12", "#6f7f52", "#4f6f8f", "#6b4a2c"]),
    },
    skin: {
      oiliness: between(25, 95), moisture: between(25, 95), radiance: between(35, 95), redness: between(35, 95),
      texture: between(30, 95), pore: between(30, 95), wrinkle: between(40, 95), acne: between(40, 95), dark_circle: between(30, 95),
    },
    shape: {
      faceShape: oneOf(["Oval", "Round", "Heart", "Square", "Diamond"]),
      eyeShape: oneOf(["Almond", "Round", "Narrow"]),
      eyelid: oneOf(["Double-lid", "Double-lid", "Hooded-lid", "Single-lid", "Deep-Set"]),
      eyebrowThickness: "Medium",
      lipShape: oneOf(["Average", "Thin", "Full", "Wide"]),
      cheekbones: "High Cheekbone",
    },
  };
}

/** The tastes hidden from the model. It has to find these from clicks alone. */
const HIDDEN: Record<string, number> = {
  "oily|finish:matte": 1.5,
  "oily|finish:dewy": -1.3,
  "dry|finish:dewy": 1.3,
  "dry|finish:matte": -1.1,
  "dry|claim:hydrating": 1.1,
  "thin-lips|finish:gloss": 1.4,
  "hooded|claim:waterproof": 1.6,
  "textured|finish:shimmer": -1.5,
  "textured|claim:blurring": 1.2,
  "depth:deep|finish:shimmer": 0.9,
  "depth:fair|finish:gloss": 0.5,
  "undertone:cool|finish:satin": 0.7,
};

function chanceOfLiking(face: Face, product: EngineProduct, optical: number) {
  const traits = traitTags(traitsOf(face));
  const tags = attributeTags(product.attributes);
  let logit = -2.6 + 1.4 * optical;
  for (const trait of traits) for (const tag of tags) logit += HIDDEN[`${trait}|${tag}`] ?? 0;
  return 1 / (1 + Math.exp(-logit));
}

/** Average true chance of liking the top ten, when each strategy picks them from the same pool. */
function testStrategy(model: Model | null, byDepth?: Record<string, { liked: number; shown: number }>) {
  const saved = state;
  state = 777;
  let liked = 0;
  for (let i = 0; i < TEST_SHOPPERS; i++) {
    const face = simulatedFace();
    const pool = Array.from({ length: POOL }, () => oneOf(products));
    const ranked = model
      ? pool.flatMap((p) => fit(face, p, model) ?? []).sort((a, b) => b.score - a.score)
      : pool.flatMap((p) => fit(face, p, RULES_ONLY) ?? []).sort(() => random() - 0.5);
    for (const f of ranked.slice(0, 10)) {
      const p = products.find((x) => x.id === f.productId)!;
      const chance = chanceOfLiking(face, p, f.signals.optical);
      liked += chance;
      if (byDepth) {
        const depth = (byDepth[traitsOf(face).depth] ??= { liked: 0, shown: 0 });
        depth.liked += chance;
        depth.shown++;
      }
    }
  }
  state = saved;
  return liked / (TEST_SHOPPERS * 10);
}

const model: Model = { ...RULES_ONLY, weights: [...RULES_ONLY.weights], pairs: {}, seen: {}, source: "simulated" };
const history: { shoppers: number; liked: number }[] = [];
const baseline = { random: testStrategy(null), rules: testStrategy(RULES_ONLY) };

for (let shopper = 1; shopper <= SHOPPERS; shopper++) {
  const face = simulatedFace();
  const traits = traitTags(traitsOf(face));
  const pool = Array.from({ length: POOL }, () => oneOf(products));
  const shown = pool
    .flatMap((p) => fit(face, p, model, { explore: random }) ?? [])
    .sort((a, b) => b.score - a.score)
    .slice(0, SHOWN);
  for (const f of shown) {
    const product = products.find((p) => p.id === f.productId)!;
    const liked = random() < chanceOfLiking(face, product, f.signals.optical);
    const kind: EventKind = liked ? oneOf<EventKind>(["click", "save", "tryon"]) : "skip";
    update(model, f.signals, traits, attributeTags(product.attributes), kind);
  }
  if (shopper % 150 === 0) history.push({ shoppers: shopper, liked: testStrategy(model) });
}

const toneRules: Record<string, { liked: number; shown: number }> = {};
const toneLearned: Record<string, { liked: number; shown: number }> = {};
testStrategy(RULES_ONLY, toneRules);
const learned = testStrategy(model, toneLearned);
const round = (v: number) => Math.round(v * 1000) / 1000;
const report = {
  note: "Simulated shoppers with hidden tastes. Shows the engine learns, not that its advice is right.",
  shoppers: SHOPPERS,
  events: model.events,
  likedInTopTen: { random: round(baseline.random), rules: round(baseline.rules), learned: round(learned) },
  history: history.map((h) => ({ shoppers: h.shoppers, liked: round(h.liked) })),
  fairness: Object.keys(toneLearned).map((depth) => ({
    depth,
    shoppersTested: toneLearned[depth].shown / 10,
    rules: round(toneRules[depth].liked / toneRules[depth].shown),
    learned: round(toneLearned[depth].liked / toneLearned[depth].shown),
  })),
  strongest: strongestPairs(model, 10),
};

// The pair table is large, so the app keeps only the pairs with real evidence behind them.
const keep = Object.entries(model.pairs).filter(([key]) => (model.seen[key] ?? 0) >= 8);
const saved: Model = {
  ...model,
  weights: model.weights.map(round),
  pairs: Object.fromEntries(keep.map(([k, v]) => [k, round(v)])),
  seen: Object.fromEntries(keep.map(([k]) => [k, model.seen[k]])),
};
writeFileSync(new URL("../data/model.json", import.meta.url), JSON.stringify(saved));
writeFileSync(new URL("../data/simulation.json", import.meta.url), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
