// Makes Mirette's own photographs: YouCam applies a real catalog shade to an AI-made sample face.
// The images belong to the project and show no brand, so they are safe for the demo and the video.
// Costs 1 YouCam unit per image and skips images that already exist.
// Run: npm run looks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createTask, hasKey, makeupEffect, resultUrl, uploadImage, waitForTask } from "../lib/youcam";

const FACES = ["sample", "ines", "amara", "lucie"];
const LIMIT = Number(process.argv[2] ?? 24);
const TYPES = ["lipstick", "lip_gloss", "foundation", "blush", "bronzer", "concealer"];

type Product = { id: string; type: string; shades: { name: string; hex: string | null }[] };

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const { products } = read("../data/catalog.json") as { products: Product[] };
const attributes = read("../data/attributes.json") as Record<string, { finish: string | null }>;
const outPath = new URL("../data/looks.json", import.meta.url);
const looks = read("../data/looks.json") as { productId: string; shade: string; face: string; file: string }[];

if (!hasKey()) throw new Error("Set YOUCAM_API_KEY in .env.local first");
mkdirSync(new URL("../public/looks/", import.meta.url), { recursive: true });

// Products with the most clearly different colours make the strongest pictures.
const variety = (p: Product) => new Set(p.shades.flatMap((s) => (s.hex ? [s.hex[1] + s.hex[3] + s.hex[5]] : []))).size;
const queue = TYPES.flatMap((type) =>
  products
    .filter((p) => p.type === type && p.shades.some((s) => s.hex))
    .sort((a, b) => variety(b) - variety(a))
    .slice(0, Math.ceil(LIMIT / TYPES.length)),
).slice(0, LIMIT);

const fileIds = new Map<string, string>();
async function fileFor(face: string) {
  const known = fileIds.get(face);
  if (known) return known;
  const bytes = readFileSync(new URL(`../public/faces/${face}.jpg`, import.meta.url));
  const id = await uploadImage(new Uint8Array(bytes), "image/jpeg", `${face}.jpg`);
  fileIds.set(face, id);
  return id;
}

let made = 0;
for (const [i, product] of queue.entries()) {
  const face = FACES[i % FACES.length];
  const shade = product.shades.filter((s) => s.hex)[0];
  const file = `/looks/${face}-${i}.jpg`;
  const target = new URL(`../public${file}`, import.meta.url);
  if (existsSync(target)) continue;

  const effect = makeupEffect(product.type, attributes[product.id]?.finish ?? null, shade.hex!);
  if (!effect) continue;
  try {
    const id = await createTask("makeup", { src_file_id: await fileFor(face), effects: [effect], version: "1.0" });
    const url = resultUrl(await waitForTask("makeup", id));
    if (!url) throw new Error("No image in the result");
    const res = await fetch(url);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    looks.push({ productId: product.id, shade: shade.name, face, file });
    writeFileSync(outPath, JSON.stringify(looks, null, 2));
    made++;
    console.log(`${made}/${queue.length} ${file}`);
  } catch (error) {
    console.log(`Skipped ${product.id}: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`Made ${made} images, ${made} units used. Set BRAND_FREE=1 to show them.`);
