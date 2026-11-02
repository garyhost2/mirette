// Sorts a product into a makeup group from its title, type and tags, or drops it.

const SKIP = /\b(bundle|gift ?set|gift card|sample|kit|duo|trio|set of|palette set|collection|brush(es)?|sponge|blender|remover|sharpener|pouch|bag|mirror|cleanser|serum|moisturi[sz]er|sunscreen|shampoo|nail|fragrance|perfume|candle|body|hair|holder|case only|refill tray)\b/i;

// Order matters: "lip liner" must be caught before "liner", "brow gel" before "gel".
const GROUPS = [
  ["lip_liner", "lips", /\blip ?liner|lip pencil\b/i],
  ["lip_gloss", "lips", /\b(lip ?gloss|gloss bomb|lip oil|lip shine|lip plumper|gloss)\b/i],
  ["lipstick", "lips", /\b(lipstick|lip colou?r|lip stain|lip tint|lip cream|lip crayon|liquid lip|lip velvet|tinted lip|lip)\b/i],
  ["brow", "eyes", /\b(brow|eyebrow)\b/i],
  ["mascara", "eyes", /\bmascara\b/i],
  ["eyeliner", "eyes", /\b(eyeliner|eye liner|kohl|eye pencil|liquid liner|liner)\b/i],
  ["eyeshadow", "eyes", /\b(eyeshadow|eye shadow|shadow palette|eye palette|shadow stick|shadow)\b/i],
  ["lashes", "eyes", /\b(lashes|false lash|lash)\b/i],
  ["foundation", "face", /\b(foundation|skin tint|tinted (moisturi[sz]er|serum)|bb cream|cc cream|skin tint)\b/i],
  ["concealer", "face", /\b(concealer|corrector)\b/i],
  ["primer", "face", /\bprimer\b/i],
  ["blush", "cheeks", /\b(blush|blusher|cheeks?)\b/i],
  ["bronzer", "cheeks", /\b(bronzer|bronzing|contour|sculpt)\b/i],
  ["highlighter", "cheeks", /\b(highlighter|illuminator|strobe)\b/i],
  ["powder", "face", /\b(setting powder|pressed powder|loose powder|powder)\b/i],
  ["setting_spray", "face", /\b(setting spray|setting mist|fixing spray)\b/i],
];

/** Types where each variant is a colour the shopper wears, so shade matching applies. */
export const SHADED = new Set([
  "foundation", "concealer", "powder", "blush", "bronzer", "highlighter",
  "lipstick", "lip_gloss", "lip_liner", "eyeshadow", "eyeliner", "brow",
]);

export function classify({ title = "", product_type = "", tags = [] }) {
  const tagText = Array.isArray(tags) ? tags.join(" ") : tags;
  const headline = `${title} ${product_type}`;
  if (SKIP.test(title) || SKIP.test(product_type)) return null;
  for (const [type, group, re] of GROUPS) {
    if (re.test(headline)) return { type, group };
  }
  for (const [type, group, re] of GROUPS) {
    if (re.test(tagText)) return { type, group };
  }
  return null;
}
