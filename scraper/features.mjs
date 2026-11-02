// Art-directed picks for the feed: photos chosen by eye from the sellers' own galleries.
// Writes data/features.json, matching each photo to its catalog product by the seller's page.
// Run after a fresh scrape: node scraper/features.mjs (needs .data/pick/picks.json from a contact sheet).

import { readFileSync, writeFileSync } from "node:fs";

const PICKS = [11, 7, 55, 58, 22, 20, 63, 71, 18, 120, 59, 61, 123, 3, 47, 135, 134, 17, 126, 56, 143, 65, 66, 75, 70, 128, 48];

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));

const picks = read("../.data/pick/picks.json");
const catalog = read("../data/catalog.json");
const rawById = new Map();
for (const seller of new Set(picks.map((p) => p.seller))) {
  for (const p of read(`../data/raw/${seller}.json`).products) rawById.set(p.id, p);
}

const features = new Map();
const missing = [];
for (const index of PICKS) {
  const pick = picks[index];
  const raw = rawById.get(pick.id);
  const product = catalog.products.find((c) => c.offers.some((o) => o.url === raw.url));
  if (!product) {
    missing.push(`${index} ${pick.title}`);
    continue;
  }
  const entry = features.get(product.id) ?? { id: product.id, photos: [] };
  entry.photos.push(pick.url);
  features.set(product.id, entry);
}

writeFileSync(new URL("../data/features.json", import.meta.url), JSON.stringify([...features.values()]));
console.log(`${features.size} products, ${PICKS.length - missing.length} photos`);
if (missing.length) console.log("Not in the catalog:", missing);
