// Reads what the sellers say about each product and turns it into attributes the engine can use.
// Only explicit words count: a product with no finish word gets none, rather than a guess.
// Run after normalize: node scraper/attributes.mjs

import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = new URL("../data/catalog.json", import.meta.url);
const OUT = new URL("../data/attributes.json", import.meta.url);

const FINISH = [
  ["matte", /\b(matte|matt|mattifying|velvet|powder finish)\b/],
  ["gloss", /\b(gloss|glossy|high[- ]shine|lacquer|vinyl|glass|mirror)\b/],
  ["dewy", /\b(dewy|luminous|radiant|glow|glowy|skin[- ]like glow)\b/],
  ["satin", /\b(satin|soft[- ]matte|natural finish|semi[- ]matte)\b/],
  ["shimmer", /\b(shimmer|metallic|glitter|sparkle|pearl|duochrome|foil)\b/],
];

const COVERAGE = [
  ["full", /\b(full[- ]coverage|full coverage|high[- ]coverage|opaque|highly pigmented)\b/],
  ["medium", /\b(medium[- ]coverage|buildable)\b/],
  ["sheer", /\b(sheer|light[- ]coverage|lightweight coverage|skin tint|tinted|translucent)\b/],
];

const FORMULA = [
  ["stick", /\b(stick|balm)\b/],
  ["cream", /\b(cream|creamy|butter|mousse)\b/],
  ["liquid", /\b(liquid|serum|fluid|oil)\b/],
  ["powder", /\b(powder|pressed|baked|loose)\b/],
  ["pencil", /\b(pencil|crayon|kohl)\b/],
];

const CLAIMS = [
  ["waterproof", /\b(waterproof|water[- ]resistant|smudge[- ]?proof|transfer[- ]?proof|sweat[- ]?proof)\b/],
  ["longwear", /\b(long[- ]?wear|long[- ]lasting|\d+[- ]?h(our|r)s?|all[- ]day|stays? put)\b/],
  ["hydrating", /\b(hydrat\w+|moistur\w+|nourish\w+|hyaluronic|squalane|plumping)\b/],
  ["oilfree", /\b(oil[- ]free|oil[- ]control|shine[- ]control|mattif\w+)\b/],
  ["noncomedogenic", /\b(non[- ]?comedogenic)\b/],
  ["blurring", /\b(blur\w*|pore[- ]minimi\w+|soft[- ]focus|smooth\w+)\b/],
  ["spf", /\bspf\s?\d+/],
];

/** How much of the skin or lip shows through, by type then finish. These are starting estimates. */
const BASE_OPACITY = {
  foundation: 0.6, concealer: 0.75, powder: 0.3, blush: 0.3, bronzer: 0.3, highlighter: 0.25,
  lipstick: 0.8, lip_gloss: 0.4, lip_liner: 0.85, eyeshadow: 0.6, eyeliner: 0.95, mascara: 0.9, brow: 0.6,
};

function first(table, text) {
  return table.find(([, re]) => re.test(text))?.[0] ?? null;
}

function opacityOf(type, coverage, finish) {
  let o = BASE_OPACITY[type] ?? 0.5;
  if (coverage === "sheer") o -= 0.2;
  if (coverage === "full") o += 0.2;
  if (finish === "matte" && type === "lipstick") o += 0.1;
  return Math.max(0.15, Math.min(0.95, Math.round(o * 100) / 100));
}

const { products } = JSON.parse(readFileSync(CATALOG));
const out = {};
const counts = { finish: 0, coverage: 0, formula: 0, claims: 0 };

for (const p of products) {
  const text = `${p.title} ${p.summary}`.toLowerCase();
  const finish = first(FINISH, text);
  const coverage = first(COVERAGE, text);
  const formula = first(FORMULA, p.title.toLowerCase()) ?? first(FORMULA, text);
  const claims = CLAIMS.filter(([, re]) => re.test(text)).map(([name]) => name);
  out[p.id] = { finish, coverage, formula, claims, opacity: opacityOf(p.type, coverage, finish) };
  if (finish) counts.finish++;
  if (coverage) counts.coverage++;
  if (formula) counts.formula++;
  if (claims.length) counts.claims++;
}

writeFileSync(OUT, JSON.stringify(out));
console.log(`${products.length} products:`, counts);
