// Reads each shade's colour from its image and stores it in catalog.json as a hex value.
// These colours are estimates: a picture of a bottle is not a lab swatch, so the app labels them
// as approximate. Results are cached, so a rerun only fetches new images.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const CATALOG = new URL("../data/catalog.json", import.meta.url);
const CACHE = new URL("../data/shade-colors.json", import.meta.url);
const WORKERS = 4;
const PAUSE_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The median of the coloured pixels near the centre, ignoring white backgrounds and black text. */
async function colourOf(url) {
  const small = `${url}${url.includes("?") ? "&" : "?"}width=96`;
  const res = await fetch(small, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).metadata();
  const crop = Math.round(Math.min(meta.width, meta.height) * 0.6);
  const { data, info } = await sharp(input)
    .extract({
      left: Math.round((meta.width - crop) / 2),
      top: Math.round((meta.height - crop) / 2),
      width: crop,
      height: crop,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 14 && r + g + b > 70 && r + g + b < 715) pixels.push([r, g, b]);
  }
  if (pixels.length < 30) return null;
  const median = (c) => pixels.map((p) => p[c]).sort((a, b) => a - b)[pixels.length >> 1];
  return toHex(median(0), median(1), median(2));
}

function labOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  const a = 500 * (x - y);
  const bb = 200 * (y - z);
  return { L: 116 * y - 16, a, b: bb, hue: (Math.atan2(bb, a) * 180) / Math.PI, chroma: Math.hypot(a, bb) };
}

/** Rejects colours that came from packaging: a yellow-green lipstick is really its box. */
function plausible(type, hex) {
  const { a, hue, chroma } = labOf(hex);
  if (["foundation", "concealer", "powder"].includes(type)) return hue >= 35 && hue <= 90 && chroma >= 5;
  if (["lipstick", "lip_gloss", "lip_liner", "blush"].includes(type)) return a >= 10 && hue >= -60 && hue <= 75;
  return true;
}

const catalog = JSON.parse(readFileSync(CATALOG));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE)) : {};
const urls = [...new Set(catalog.products.flatMap((p) => p.shades.map((s) => s.image)).filter(Boolean))];
const todo = urls.filter((u) => !(u in cache));
console.log(`${urls.length} shade images, ${todo.length} to fetch`);

let next = 0;
let failed = 0;
async function worker() {
  while (next < todo.length) {
    const url = todo[next++];
    try {
      cache[url] = await colourOf(url);
    } catch {
      cache[url] = null;
      failed++;
    }
    if (next % 200 === 0) {
      console.log(`${next}/${todo.length}`);
      writeFileSync(CACHE, JSON.stringify(cache));
    }
    await sleep(PAUSE_MS);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
writeFileSync(CACHE, JSON.stringify(cache));

/** Different shades that all read as one colour were measured off the packaging, not the makeup. */
function allTheSame(hexes) {
  if (hexes.length < 3) return false;
  const labs = hexes.map(labOf);
  const near = (x, y) => Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) < 5;
  const largestGroup = Math.max(...labs.map((x) => labs.filter((y) => near(x, y)).length));
  return largestGroup / labs.length >= 0.6;
}

let coloured = 0;
let packaging = 0;
for (const p of catalog.products) {
  for (const s of p.shades) {
    const hex = cache[s.image];
    s.hex = hex && plausible(p.type, hex) ? hex : null;
  }
  const hexes = p.shades.map((s) => s.hex).filter(Boolean);
  if (allTheSame(hexes)) {
    packaging++;
    for (const s of p.shades) s.hex = null;
  }
  coloured += p.shades.filter((s) => s.hex).length;
}
console.log(`${packaging} products dropped their colours as packaging`);
writeFileSync(CATALOG, JSON.stringify(catalog));
console.log(`${coloured} shades have a colour, ${failed} images failed`);
