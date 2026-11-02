// Finds two kinds of match across the whole catalog. Writes data/matches.json.
//   Cheaper matches: the same kind of product, another brand, a colour the eye can barely tell apart, for less.
//   Colour families: products grouped by what a shopper would call them, such as "Matte reds".
// Shade colours are estimates read from product images, so these are leads, not lab results.
// Run: npm run matches

import { readFileSync, writeFileSync } from "node:fs";
import { deltaE2000, hexToLab, type Lab } from "../lib/color";
import type { Attributes } from "../lib/suit";

/** Above about 3 two shades start to look different side by side. */
const SAME_COLOUR = 3;
const MIN_SAVING_EUR = 2;
const PER_PRODUCT = 3;
const MIN_FAMILY = 4;
/** Lips and cheeks can be swapped within these groups. Skin products need the same type. */
const KIND: Record<string, string> = {
  lipstick: "lip", lip_gloss: "gloss", lip_liner: "liner", foundation: "foundation", concealer: "concealer",
  powder: "powder", blush: "blush", bronzer: "bronzer", highlighter: "highlighter", eyeshadow: "eyeshadow", eyeliner: "eyeliner", brow: "brow",
};

type Shade = { name: string; hex: string | null };
type Offer = { url: string; priceEur: number; available: boolean };
type Product = { id: string; brand: string; title: string; type: string; group: string; shades: Shade[]; offers: Offer[]; priceFrom: number; sizesMayDiffer?: boolean };

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const { products } = read("../data/catalog.json") as { products: Product[] };
const attributes = read("../data/attributes.json") as Record<string, Attributes>;

const brandKey = (b: string) => b.toLowerCase().replace(/[^a-z0-9]/g, "");
const inStock = (p: Product) => p.offers.some((o) => o.available);
/** A palette holds several products, so its price cannot be compared with a single one. */
const isPalette = (p: Product) => /\b(palette|quad|edit|collection|mini)\b/i.test(p.title);

// Finishes that cannot stand in for each other, even in the same colour.
const clash = (a: string | null, b: string | null) => !!a && !!b && a !== b && (a === "shimmer" || b === "shimmer" || a === "gloss" || b === "gloss");

type Entry = { product: Product; shade: string; hex: string; lab: Lab };
const byKind = new Map<string, Entry[]>();
for (const product of products) {
  const kind = KIND[product.type];
  if (!kind || !inStock(product) || isPalette(product)) continue;
  for (const s of product.shades) {
    if (!s.hex) continue;
    const list = byKind.get(kind) ?? [];
    list.push({ product, shade: s.name, hex: s.hex, lab: hexToLab(s.hex) });
    byKind.set(kind, list);
  }
}

type Cheaper = { id: string; shade: string; forShade: string; deltaE: number; saveEur: number; hex: string };
const cheaper: Record<string, Cheaper[]> = {};

for (const list of byKind.values()) {
  for (const a of list) {
    for (const b of list) {
      if (a.product.id === b.product.id || brandKey(a.product.brand) === brandKey(b.product.brand)) continue;
      const save = a.product.priceFrom - b.product.priceFrom;
      if (save < MIN_SAVING_EUR) continue;
      if (clash(attributes[a.product.id]?.finish ?? null, attributes[b.product.id]?.finish ?? null)) continue;
      // Quick test first: colours far apart in lightness cannot be close, and full comparison is slow.
      if (Math.abs(a.lab.L - b.lab.L) > 8) continue;
      const gap = deltaE2000(a.lab, b.lab);
      if (gap > SAME_COLOUR) continue;
      const found = cheaper[a.product.id] ?? [];
      const known = found.find((m) => m.id === b.product.id);
      const match = { id: b.product.id, shade: b.shade, forShade: a.shade, deltaE: Math.round(gap * 10) / 10, saveEur: Math.round(save * 100) / 100, hex: b.hex };
      if (known && known.deltaE <= match.deltaE) continue;
      cheaper[a.product.id] = [...found.filter((m) => m.id !== b.product.id), match];
    }
  }
}
for (const id of Object.keys(cheaper)) {
  cheaper[id] = cheaper[id].sort((x, y) => x.deltaE - y.deltaE || y.saveEur - x.saveEur).slice(0, PER_PRODUCT);
}

/** Plain colour words from Lab values. Lips and cheeks have their own, because a shopper names them differently. */
function colourWord(lab: Lab, group: string) {
  const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  const chroma = Math.hypot(lab.a, lab.b);
  if (group === "eyes") {
    if (chroma < 8) return lab.L < 35 ? "blacks" : "greys";
    return lab.L > 65 ? "golds and creams" : lab.L > 40 ? "bronzes" : "browns";
  }
  if (group === "face") return lab.L > 75 ? "fair tones" : lab.L > 60 ? "light tones" : lab.L > 45 ? "medium tones" : lab.L > 30 ? "tan tones" : "deep tones";
  if (chroma < 16 || (lab.L > 62 && chroma < 28)) return lab.L > 55 ? "nudes" : "browns";
  if (hue > 340 || hue < 8) return lab.L > 58 ? "pinks" : lab.L > 34 ? "roses" : "berries";
  if (hue < 32) return lab.L > 58 ? "corals" : "reds";
  if (hue < 60) return lab.L > 55 ? "peaches" : "terracottas";
  return "nudes";
}

const FINISH_WORD: Record<string, string> = { matte: "Matte", gloss: "Glossy", dewy: "Dewy", satin: "Satin", shimmer: "Shimmer" };
const GROUP_WORD: Record<string, string> = { lips: "lips", face: "skin", cheeks: "cheeks", eyes: "eyes" };

const medianLab = (shades: Shade[]) => {
  const labs = shades.flatMap((s) => (s.hex ? [hexToLab(s.hex)] : []));
  const mid = (pick: (l: Lab) => number) => labs.map(pick).sort((x, y) => x - y)[labs.length >> 1];
  return { L: mid((l) => l.L), a: mid((l) => l.a), b: mid((l) => l.b) };
};

const families = new Map<string, { id: string; name: string; group: string; products: string[] }>();
for (const p of products) {
  if (!p.shades.some((s) => s.hex) || !GROUP_WORD[p.group]) continue;
  const word = colourWord(medianLab(p.shades), p.group);
  const finish = FINISH_WORD[attributes[p.id]?.finish ?? ""];
  const name = finish ? `${finish} ${word}` : `${word[0].toUpperCase()}${word.slice(1)}`;
  const label = p.group === "lips" || p.group === "eyes" ? name : `${name} for ${GROUP_WORD[p.group]}`;
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const family = families.get(id) ?? { id, name: label, group: p.group, products: [] };
  family.products.push(p.id);
  families.set(id, family);
}
const kept = [...families.values()].filter((f) => f.products.length >= MIN_FAMILY).sort((a, b) => b.products.length - a.products.length);

writeFileSync(new URL("../data/matches.json", import.meta.url), JSON.stringify({ cheaper, families: kept }));

const pairs = Object.values(cheaper).flat();
const save = pairs.map((m) => m.saveEur).sort((a, b) => a - b);
console.log(`Cheaper matches: ${Object.keys(cheaper).length} products, ${pairs.length} matches, median saving €${save[save.length >> 1] ?? 0}`);
console.log(`Colour families: ${kept.length} covering ${kept.reduce((n, f) => n + f.products.length, 0)} products`);
console.log(kept.slice(0, 14).map((f) => `${f.name} (${f.products.length})`).join(", "));
const title = (id: string) => { const p = products.find((x) => x.id === id)!; return `${p.brand} ${p.title} €${p.priceFrom}`; };
for (const [id, list] of Object.entries(cheaper).slice(0, 6)) {
  const m = list[0];
  console.log(`  ${title(id)} [${m.forShade}] → ${title(m.id)} [${m.shade}] ΔE ${m.deltaE}, saves €${m.saveEur}`);
}
