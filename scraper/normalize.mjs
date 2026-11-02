// Turns the raw feeds into data/catalog.json: one product per real product, with its shades
// and an offer from every seller, priced in euros so sellers can be compared.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { classify, SHADED } from "./classify.mjs";
import { SELLERS } from "./sellers.mjs";

const RAW = new URL("../data/raw/", import.meta.url);
const OUT = new URL("../data/catalog.json", import.meta.url);

const NOT_A_SINGLE_PRODUCT = /\b(advent|calendar|routine|vault|posse|\d+-piece|piece set|lip set|gifted|gift|travel size|mini|sample|sets?|kits?|duos?|trios?|bundles?)\b/i;
// Skincare that sellers file under lips or eyes. It has no colour to wear, so it would corrupt matching.
const NOT_MAKEUP = /\b(patch|patches|mask|masks|scrub|serum|cleanser|toner|anti.?ag\w*|eye cream|contour cream|eye & lip|treatment|remover|sunscreen|moisturi[sz]er|hand cream)\b/i;
/** A variant named only by its size is a pack, not a shade. */
const SIZE_ONLY = /^\d+([.,]\d+)?\s?(ml|g|gr|oz|fl)\b/i;
const NOT_FOR_THIS_APP = /\b(bitch|fuck|shit)\w*|fu\$\$y/i;
const MATCH_THRESHOLD = 0.75;
// Past this gap two listings are probably different pack sizes, not a better deal.
const SIZE_GAP = 1.6;

const SELLER_NAME = Object.fromEntries(SELLERS.map((s) => [s.id, s.name]));

async function euroRates() {
  try {
    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", {
      signal: AbortSignal.timeout(10000),
    });
    const xml = await res.text();
    const rates = { EUR: 1 };
    for (const [, code, rate] of xml.matchAll(/currency='([A-Z]{3})' rate='([\d.]+)'/g)) rates[code] = Number(rate);
    if (rates.USD && rates.GBP) return { rates, source: "ECB daily reference rate" };
  } catch {
    // fall through
  }
  throw new Error("Could not read exchange rates, so prices were not converted");
}

const words = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function brandOf(p) {
  const v = p.brand.trim();
  if (/^bperfect megastore/i.test(v) && p.title.includes(" - ")) return p.title.split(" - ")[0].trim();
  if (/^bperfect/i.test(v)) return "BPerfect";
  return v;
}

const brandKey = (b) =>
  words(b).replace(/\b(beauty|cosmetics|cosmetic|makeup|make up|skincare)\b/g, "").replace(/\s+/g, " ").trim();

function cleanTitle(p, brand) {
  let title = p.title.trim();
  if (/^bperfect megastore/i.test(p.brand) && title.includes(" - ")) title = title.split(" - ").slice(1).join(" - ");
  const prefix = new RegExp(`^${brandKey(brand).split(" ").filter(Boolean).join("\\W+")}(\\W+(beauty|cosmetics))?\\W+`, "i");
  title = title.replace(prefix, "");
  // "Foundation — 596N": one shade per listing, as Fenty does.
  const [base, shade] = title.split(/\s+[—–]\s+/);
  return { base: base.replace(/\s+-\s+(hero|core)$/i, "").trim(), shade: shade?.trim() };
}

function tokens(title) {
  const stop = new Set(["the", "a", "an", "of", "for", "with", "and", "in", "by", "ml", "g", "oz"]);
  return new Set(words(title).split(" ").filter((t) => t && !stop.has(t) && !/^\d+(ml|g|oz)?$/.test(t)));
}

function similarity(a, b) {
  const shared = [...a].filter((t) => b.has(t)).length;
  return shared / (a.size + b.size - shared || 1);
}

const { rates, source } = await euroRates();
const toEur = (price, currency) => Math.round((price / rates[currency]) * 100) / 100;

const listings = readdirSync(RAW).flatMap((f) => JSON.parse(readFileSync(new URL(f, RAW))).products);

const products = [];
const byBrand = new Map();
const usedIds = new Set();
let dropped = 0;

/** One product can be listed under two types, so its type keeps the two ids apart. */
function uniqueId(id, type) {
  const unique = usedIds.has(id) ? `${id}-${type.replace(/_/g, "-")}` : id;
  usedIds.add(unique);
  return unique;
}

for (const raw of listings) {
  // Raw files keep the type from scrape time, so a fix to the rules applies without scraping again.
  Object.assign(raw, classify({ title: raw.title }));
  const brand = brandOf(raw);
  const { base, shade } = cleanTitle(raw, brand);
  const live = raw.variants.filter((v) => v.price > 0);
  if (NOT_A_SINGLE_PRODUCT.test(raw.title) || NOT_MAKEUP.test(raw.title) || NOT_FOR_THIS_APP.test(raw.title) || !live.length || !raw.images.length) {
    dropped++;
    continue;
  }
  const key = brandKey(brand);
  const shape = tokens(base);
  const peers = byBrand.get(key) ?? [];
  let product = peers.find((p) => p.type === raw.type && similarity(p.shape, shape) >= MATCH_THRESHOLD);
  if (!product) {
    product = {
      id: uniqueId(`${key}-${words(base)}`.replace(/\s+/g, "-").slice(0, 80), raw.type),
      brand,
      title: base,
      type: raw.type,
      group: raw.group,
      summary: raw.summary,
      image: raw.images[0],
      shape,
      shades: new Map(),
      offers: new Map(),
    };
    peers.push(product);
    byBrand.set(key, peers);
    products.push(product);
  }

  for (const v of live) {
    const offer = product.offers.get(raw.seller) ?? {
      seller: raw.seller,
      sellerName: SELLER_NAME[raw.seller],
      currency: raw.currency,
      url: raw.url,
      available: false,
      prices: [],
    };
    offer.prices.push(v.price);
    offer.available ||= v.available;
    product.offers.set(raw.seller, offer);
    const name = shade ?? v.name;
    if (!name || !SHADED.has(raw.type) || SIZE_ONLY.test(name)) continue;
    const shadeKey = words(name);
    if (!product.shades.has(shadeKey)) {
      product.shades.set(shadeKey, { name, image: v.image ?? (shade ? raw.images[0] : null) });
    }
  }
}

/** A seller's normal price: the most common one, so one discounted shade cannot pose as the price. */
function usualPrice(prices) {
  const counts = new Map();
  for (const p of prices) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

const catalog = products.map(({ shades, offers, ...p }) => {
  delete p.shape;
  const list = [...offers.values()]
    .map(({ prices, ...offer }) => {
      const price = usualPrice(prices);
      return { ...offer, price, priceEur: toEur(price, offer.currency) };
    })
    .sort((a, b) => Number(b.available) - Number(a.available) || a.priceEur - b.priceEur);
  const prices = list.map((o) => o.priceEur);
  return {
    ...p,
    shades: [...shades.values()],
    offers: list,
    priceFrom: list[0].priceEur,
    sizesMayDiffer: Math.max(...prices) / Math.min(...prices) >= SIZE_GAP,
  };
});

writeFileSync(
  OUT,
  JSON.stringify({ builtAt: new Date().toISOString(), rates: { GBP: rates.GBP, USD: rates.USD, source }, products: catalog }),
);

const compared = catalog.filter((p) => p.offers.length > 1);
console.log(`${listings.length} listings, ${dropped} dropped, ${catalog.length} products`);
console.log(`${catalog.reduce((s, p) => s + p.shades.length, 0)} shades, ${compared.length} products at 2+ sellers`);
console.log(`Rates: 1 EUR = ${rates.USD} USD, ${rates.GBP} GBP (${source})`);
for (const p of compared.slice(0, 6)) {
  console.log(`  ${p.brand} ${p.title}: ${p.offers.map((o) => `${o.seller} €${o.priceEur}`).join(", ")}`);
}
