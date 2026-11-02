// Downloads each seller's public product feed into data/raw/<seller>.json.
//   node scraper/scrape.mjs            all sellers
//   node scraper/scrape.mjs nabla rare only these
// Polite by design: obeys robots.txt, waits between requests, and stops at the first refusal.

import { mkdir, writeFile } from "node:fs/promises";
import { classify } from "./classify.mjs";
import { SELLERS } from "./sellers.mjs";

const UA = "Mirette-catalog/0.1 (makeup price comparison)";
const DELAY_MS = 1500;
const PAGE_SIZE = 250;
const MAX_PAGES = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  return fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
    signal: AbortSignal.timeout(30000),
  });
}

/** Disallow rules that apply to us: our own group if the site names us, otherwise "*". */
function disallowed(robots, path) {
  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^(user-agent|disallow|allow):\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    if (field === "user-agent") {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(m[2].trim().toLowerCase());
    } else if (current && m[2].trim()) {
      current.rules.push({ allow: field === "allow", path: m[2].trim() });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const hits = rules.filter((r) => {
    const body = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    return new RegExp(`^${body}`).test(path);
  });
  // The longest matching rule wins, as in the robots.txt standard.
  const top = hits.sort((a, b) => b.path.length - a.path.length)[0];
  return Boolean(top && !top.allow);
}

const text = (html) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

function toProduct(raw, seller, currency) {
  const kind = classify(raw);
  if (!kind) return null;
  const optionName = raw.options?.[0]?.name ?? "";
  const images = (raw.images ?? []).map((i) => i.src).filter(Boolean);
  const byImageId = new Map((raw.images ?? []).map((i) => [i.id, i.src]));
  const variants = (raw.variants ?? []).map((v) => ({
    id: String(v.id),
    name: v.title === "Default Title" ? null : v.title,
    price: Number(v.price),
    compareAt: v.compare_at_price ? Number(v.compare_at_price) : null,
    available: v.available !== false,
    image: v.featured_image?.src ?? byImageId.get(v.image_id) ?? null,
  }));
  return {
    id: `${seller.id}:${raw.id}`,
    seller: seller.id,
    brand: raw.vendor || seller.name,
    title: raw.title,
    ...kind,
    url: `${seller.origin}/products/${raw.handle}`,
    summary: text(raw.body_html).slice(0, 280),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    optionName,
    currency,
    images: images.slice(0, 4),
    variants,
  };
}

async function scrapeSeller(seller) {
  const robotsRes = await get(`${seller.origin}/robots.txt`);
  const robots = robotsRes.ok ? await robotsRes.text() : "";
  if (disallowed(robots, "/products.json")) {
    console.log(`${seller.id}: robots.txt blocks the feed, skipped`);
    return null;
  }
  await sleep(DELAY_MS);

  const metaRes = await get(`${seller.origin}/meta.json`).catch(() => null);
  const meta = metaRes?.ok ? await metaRes.json().catch(() => ({})) : {};
  const currency = meta.currency ?? "EUR";

  const seen = new Map();
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    await sleep(DELAY_MS);
    const res = await get(`${seller.origin}/products.json?limit=${PAGE_SIZE}&page=${page}`);
    if (!res.ok) {
      console.log(`${seller.id}: stopped at page ${page}, status ${res.status}`);
      break;
    }
    const { products = [] } = await res.json();
    if (!products.length) break;
    total += products.length;
    for (const raw of products) {
      const product = toProduct(raw, seller, currency);
      if (product) seen.set(product.id, product);
    }
    if (products.length < PAGE_SIZE) break;
  }
  const products = [...seen.values()];
  await writeFile(
    new URL(`../data/raw/${seller.id}.json`, import.meta.url),
    JSON.stringify({ seller, currency, scrapedAt: new Date().toISOString(), total, products }, null, 1),
  );
  console.log(`${seller.id}: ${products.length} makeup products of ${total}, ${currency}`);
  return products.length;
}

await mkdir(new URL("../data/raw/", import.meta.url), { recursive: true });
const only = process.argv.slice(2);
for (const seller of SELLERS.filter((s) => !only.length || only.includes(s.id))) {
  try {
    await scrapeSeller(seller);
  } catch (err) {
    console.log(`${seller.id}: failed, ${err.message}`);
  }
}
