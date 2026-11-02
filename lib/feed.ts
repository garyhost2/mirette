import attributes from "@/data/attributes.json";
import catalog from "@/data/catalog.json";
import features from "@/data/features.json";
import looks from "@/data/looks.json";
import matches from "@/data/matches.json";
import { creatorOf, faceOfCreator, LOOKS, type Look } from "./creators";
import { traitsOf } from "./face";

export type FeedShade = { name: string; hex: string | null; image: string | null };
export type CheaperMatch = { brand: string; title: string; shade: string; forShade: string; hex: string; priceEur: number; saveEur: number; url: string };
export type FeedOffer = { seller: string; sellerName: string; priceEur: number; url: string; available: boolean };
export type FeedProduct = {
  id: string;
  brand: string;
  title: string;
  type: string;
  group: "lips" | "face" | "cheeks" | "eyes";
  image: string;
  summary: string;
  /** Matte, satin, gloss and so on, which tells two products of the same colour apart. */
  finish: string | null;
  shades: FeedShade[];
  offers: FeedOffer[];
  priceFrom: number;
  sizesMayDiffer: boolean;
  /** Campaign photos chosen by eye, shown before the shade photos. */
  photos: string[];
  /** Other brands' products in a colour the eye can barely tell apart, for less. */
  cheaper: CheaperMatch[];
};

export type StoryProduct = { id: string; type: string; typeName: string; title: string; image: string; hex: string | null };

/** One creator's story: their scan, their look and the products in it. */
export type Story = {
  id: string;
  name: string;
  photo: string;
  lookId: string;
  lookName: string;
  lookStory: string;
  scan: { label: string; value: string }[];
  scores: { label: string; value: number }[];
  products: StoryProduct[];
};

export type FeedItem =
  | { kind: "product"; product: FeedProduct }
  | { kind: "look"; look: Look; products: FeedProduct[] };

const LOOK_EVERY = 4;
const MAX_SHADES = 12;

const all = catalog.products as unknown as (FeedProduct & { offers: FeedOffer[] })[];
const photosOf = new Map(features.map((f) => [f.id, f.photos]));

/** Set for the public demo and the video: only the project's own images, and no brand or seller names. */
const BRAND_FREE = process.env.BRAND_FREE === "1";
const FACES = ["/faces/amara.jpg", "/faces/lucie.jpg", "/faces/ines.jpg", "/faces/sample.jpg"];
const TYPE_NAME: Record<string, string> = {
  lipstick: "Lip colour",
  lip_gloss: "Lip gloss",
  lip_liner: "Lip liner",
  foundation: "Foundation",
  concealer: "Concealer",
  powder: "Powder",
  blush: "Blush",
  bronzer: "Bronzer",
  highlighter: "Highlighter",
  eyeshadow: "Eyeshadow",
  eyeliner: "Eyeliner",
  mascara: "Mascara",
  brow: "Brow",
};
const ownLooks = looks as { productId: string; file: string }[];

function cheaperFor(id: string): CheaperMatch[] {
  const list = (matches.cheaper as Record<string, { id: string; shade: string; forShade: string; hex: string; saveEur: number }[]>)[id] ?? [];
  return list.flatMap((m) => {
    const other = all.find((p) => p.id === m.id);
    if (!other) return [];
    const { hex, shade, forShade, saveEur } = m;
    return [{ brand: other.brand, title: other.title, hex, shade, forShade, saveEur, priceEur: other.priceFrom, url: other.offers[0].url }];
  });
}

function brandFree(p: FeedProduct): FeedProduct {
  const own = ownLooks.filter((l) => l.productId === p.id).map((l) => l.file);
  const stand = FACES[p.id.length % FACES.length];
  return {
    ...p,
    brand: "Sample brand",
    title: TYPE_NAME[p.type] ?? "Makeup",
    summary: "",
    image: own[0] ?? stand,
    photos: own.length ? own : [stand],
    shades: p.shades.map((s, i) => ({ ...s, name: `Shade ${i + 1}`, image: null })),
    offers: p.offers.map((o, i) => ({ ...o, sellerName: `Seller ${i + 1}`, url: "#" })),
    cheaper: p.cheaper.map((c) => ({ ...c, brand: "Sample brand", title: TYPE_NAME[p.type] ?? "Makeup", shade: "Similar shade", forShade: "", url: "#" })),
  };
}

/** Keep the payload small: a card shows at most a dozen shades. */
function slim(p: FeedProduct): FeedProduct {
  const coloured = p.shades.filter((s) => s.hex);
  const shades = (coloured.length ? coloured : p.shades).slice(0, MAX_SHADES);
  const finish = (attributes as Record<string, { finish: string | null }>)[p.id]?.finish ?? null;
  const light = { ...p, finish, summary: p.summary.slice(0, 140), shades, photos: photosOf.get(p.id) ?? [], cheaper: cheaperFor(p.id) };
  return BRAND_FREE ? brandFree(light) : light;
}

/** Products that make a strong full-screen card: real shades first, then comparable prices. */
function strength(p: FeedProduct): number {
  const coloured = p.shades.filter((s) => s.hex).length;
  return Math.min(coloured, 8) + p.offers.length * 3 + (p.shades.length >= 3 ? 2 : 0);
}

export function buildFeed(): FeedItem[] {
  // The feed is art-directed: only products with a photo chosen by eye, in the chosen order.
  // Brand-free, it shows the products that have one of Mirette's own generated photos.
  const generated = [...new Set(ownLooks.map((l) => l.productId))];
  const ids = BRAND_FREE && generated.length ? generated : features.map((f) => f.id);
  const picked = ids.flatMap((id) => {
    const product = all.find((p) => p.id === id);
    return product ? [slim(product)] : [];
  });

  const items: FeedItem[] = [];
  let look = 0;
  picked.forEach((product, i) => {
    items.push({ kind: "product", product });
    if ((i + 1) % LOOK_EVERY === 0 && look < LOOKS.length) {
      const current = LOOKS[look++];
      items.push({ kind: "look", look: current, products: productsFor(current) });
    }
  });
  return items;
}

export function productsFor(look: Look): FeedProduct[] {
  return look.needs.flatMap((type) => {
    const best = all
      .filter((p) => p.type === type && p.image && !p.brand.includes(look.avoidBrand ?? "\0"))
      .sort((a, b) => strength(b) - strength(a))[look.pick];
    return best ? [slim(best)] : [];
  });
}

export const families = matches.families;

/** The products in one colour family, ready for the feed. */
export function familyItems(id: string): FeedItem[] {
  const family = families.find((f) => f.id === id);
  return (family?.products ?? []).flatMap((pid) => {
    const product = all.find((p) => p.id === pid);
    return product ? [{ kind: "product" as const, product: slim(product) }] : [];
  });
}

const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1);

export function stories(): Story[] {
  return LOOKS.map((look) => {
    const creator = creatorOf(look);
    const traits = traitsOf(faceOfCreator(creator));
    return {
      id: creator.id,
      name: creator.name,
      photo: creator.face!,
      lookId: look.id,
      lookName: look.name,
      lookStory: look.story,
      scan: [
        { label: "Skin depth", value: titleCase(traits.depth) },
        { label: "Undertone", value: titleCase(traits.undertone) },
        { label: "Contrast", value: traits.contrast >= 40 ? "High" : traits.contrast < 25 ? "Soft" : "Medium" },
        { label: "Eyelids", value: creator.shape.eyelid.replace("-lid", "") },
        { label: "Lips", value: creator.shape.lipShape },
        { label: "Face", value: creator.shape.faceShape },
      ],
      scores: [
        { label: "Hydration", value: creator.skin.moisture },
        { label: "Radiance", value: creator.skin.radiance },
        { label: "Texture", value: creator.skin.texture },
      ],
      products: productsFor(look).map((p) => ({
        id: p.id,
        type: p.type,
        typeName: TYPE_NAME[p.type] ?? "Makeup",
        title: p.title,
        image: p.image,
        hex: p.type === look.signature.type ? look.signature.hex : (p.shades.find((s) => s.hex)?.hex ?? null),
      })),
    };
  });
}

export function findProduct(id: string): FeedProduct | undefined {
  const p = all.find((x) => x.id === id);
  return p ? slim(p) : undefined;
}

/** How many clearly different colours a product has, read from the first digit of each channel. */
const variety = (p: FeedProduct) => new Set(p.shades.flatMap((s) => (s.hex ? [s.hex[1] + s.hex[3] + s.hex[5]] : []))).size;

export function tryOnProducts(): FeedProduct[] {
  const types = ["lipstick", "lip_gloss", "foundation", "blush", "eyeshadow", "eyeliner"];
  return types.flatMap((type) =>
    all
      .filter((p) => p.type === type && p.shades.some((s) => s.hex))
      .sort((a, b) => variety(b) - variety(a))
      .slice(0, 6)
      .map(slim),
  );
}

export const catalogStats = {
  products: all.length,
  shades: all.reduce((sum, p) => sum + p.shades.length, 0),
  sellers: new Set(all.flatMap((p) => p.offers.map((o) => o.seller))).size,
};
