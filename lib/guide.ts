// The face guide: what each kind of face needs from makeup, and why.
// Each rule comes from makeup practice and colour science, and is a starting point, not a verdict.
// The rules talk about skin depth, undertone and features. They never describe a person's background.

import { hexToLab, temperatureOf } from "./color";
import { traitTags, type Face, type Traits } from "./face";

type Shade = { L: number; chroma: number; pale: boolean; muted: boolean; bright: boolean; deep: boolean; warm: boolean; cool: boolean };
type Judged = { change: number; reason?: string; warning?: string };

export type GuideRule = {
  id: string;
  /** The trait this rule belongs to, as used by the graph and the model. */
  trait: string;
  title: string;
  advice: string;
  applies?: (face: Face, t: Traits) => boolean;
  types: string[];
  judge: (shade: Shade, face: Face, t: Traits, type: string) => Judged | null;
};

const LIPS = ["lipstick", "lip_gloss", "lip_liner"];
const CHEEKS = ["blush", "bronzer"];
const COLOUR = [...LIPS, ...CHEEKS, "eyeshadow"];

export function readShade(hex: string): Shade {
  const { L, a, b } = hexToLab(hex);
  const chroma = Math.hypot(a, b);
  const temperature = temperatureOf(hex);
  return { L, chroma, pale: L >= 66, muted: chroma < 24, bright: chroma >= 36, deep: L < 42, warm: temperature > 0.32, cool: temperature < 0.05 };
}

export const GUIDE: GuideRule[] = [
  {
    id: "deep-light-colours",
    trait: "depth:deep",
    title: "Light colours need strong pigment",
    advice: "Bright, rich shades look great on deep skin, and deep reds and berries suit lips. Pale, greyish ones can turn ashy.",
    types: COLOUR,
    judge: (s, _face, _t, type) => {
      const lips = LIPS.includes(type);
      if (s.pale && s.muted) return { change: -0.24, warning: "Pale and greyish, so it can look ashy on deep skin" };
      // On lips a light shade sits against darker lip colour and can look stark, so rich colour leads.
      if (s.pale && s.bright) return lips ? { change: -0.06, warning: "Very light against deep lips, so wear it sheer" } : { change: 0.18, reason: "Light but rich enough to glow on deep skin" };
      if (lips && !s.pale && s.chroma >= 30) return { change: 0.18, reason: "Rich colour stands out on deep skin" };
      if (s.deep && s.chroma >= 24) return { change: 0.12, reason: "Rich colour stands out on deep skin" };
      return null;
    },
  },
  {
    id: "deep-powder",
    trait: "depth:deep",
    title: "Avoid white-cast powder",
    advice: "Pale setting powder can leave a white cast. Choose one close to your skin or tinted.",
    types: ["powder"],
    judge: (s) => (s.pale ? { change: -0.26, warning: "Can leave a white cast on deep skin" } : { change: 0.08, reason: "Deep enough to avoid a white cast" }),
  },
  {
    id: "deep-highlight",
    trait: "depth:deep",
    title: "Gold and bronze highlight best",
    advice: "Gold, copper and bronze glow on deep skin. Icy white highlighter can look chalky.",
    types: ["highlighter"],
    judge: (s) => {
      if (s.L > 84 || s.cool) return { change: -0.18, warning: "Icy highlighter can look chalky on deep skin" };
      return s.warm ? { change: 0.18, reason: "Gold tones glow on deep skin" } : null;
    },
  },
  {
    id: "deep-blush",
    trait: "depth:deep",
    title: "Blush needs high pigment",
    advice: "Soft blush can vanish on deep skin. Bright coral, berry and fuchsia show up best.",
    types: ["blush"],
    judge: (s) => {
      if (s.chroma >= 40) return { change: 0.16, reason: "Enough pigment to show on deep skin" };
      return s.chroma < 26 ? { change: -0.14, warning: "May not show on deep skin" } : null;
    },
  },
  {
    id: "tan-warm",
    trait: "depth:tan",
    title: "Warm tones lift tan skin",
    advice: "Terracotta, brick and warm rose look natural. Cold, greyed colours can look flat.",
    types: COLOUR,
    judge: (s) => {
      if (s.warm && s.chroma >= 26) return { change: 0.1, reason: "Warm tones sit well on tan skin" };
      return s.pale && s.muted ? { change: -0.12, warning: "Greyed colour can look flat on tan skin" } : null;
    },
  },
  {
    id: "fair-bronzer",
    trait: "depth:fair",
    title: "Keep bronzer light",
    advice: "Deep bronzer can look orange or muddy on fair skin. Choose a soft, light one.",
    types: ["bronzer"],
    judge: (s) => (s.L < 48 ? { change: -0.2, warning: "Too deep, can look muddy on fair skin" } : { change: 0.1, reason: "Light enough for fair skin" }),
  },
  {
    id: "fair-blush",
    trait: "depth:fair",
    title: "A soft flush goes far",
    advice: "Fair skin shows colour easily, so sheer pinks and peaches are enough.",
    types: ["blush"],
    judge: (s) => {
      if (s.chroma > 46) return { change: -0.08, warning: "Strong on fair skin, so use a light hand" };
      return s.L > 58 ? { change: 0.1, reason: "A soft flush suits fair skin" } : null;
    },
  },
  {
    id: "warm-colours",
    trait: "undertone:warm",
    title: "Warm undertone",
    advice: "Coral, peach, gold and brick sit closest to your skin.",
    types: COLOUR,
    judge: (s) => (s.warm ? { change: 0.08, reason: "Suits your warm undertone" } : null),
  },
  {
    id: "cool-colours",
    trait: "undertone:cool",
    title: "Cool undertone",
    advice: "Rose, berry, mauve and blue-based reds sit closest to your skin.",
    types: COLOUR,
    judge: (s) => (s.cool ? { change: 0.08, reason: "Suits your cool undertone" } : null),
  },
  {
    id: "high-contrast-lip",
    trait: "high-contrast",
    title: "You carry strong colour",
    advice: "Your dark hair and brows balance a bold lip. A pale lip can disappear.",
    types: LIPS,
    judge: (s) => (s.bright && s.L < 58 ? { change: 0.1, reason: "Strong colour balances your contrast" } : null),
  },
  {
    id: "soft-contrast-lip",
    trait: "low-contrast",
    title: "Soft colours flatter you",
    advice: "Your features are close in tone, so a very dark lip can look heavy.",
    types: LIPS,
    judge: (s) => {
      if (s.deep) return { change: -0.1, warning: "Very deep for your soft contrast" };
      return s.muted ? { change: 0.08, reason: "A soft colour keeps your harmony" } : null;
    },
  },
  {
    id: "thin-lips",
    trait: "thin-lips",
    title: "Lighter lips look fuller",
    advice: "Lighter shades and shine add volume. Very dark matte makes lips look smaller.",
    types: LIPS,
    judge: (s) => {
      if (s.L > 54) return { change: 0.08, reason: "A lighter colour adds fullness" };
      return s.deep ? { change: -0.08, warning: "Dark colour makes lips look smaller" } : null;
    },
  },
  {
    id: "blue-eyes",
    trait: "blue-eyes",
    title: "Copper makes blue eyes stand out",
    advice: "Warm copper, bronze and peach sit opposite blue, so your eyes look brighter.",
    applies: (face) => hexToLab(face.tone.eye).b < -2,
    types: ["eyeshadow"],
    judge: (s) => (s.warm ? { change: 0.14, reason: "Warm tones make blue eyes stand out" } : null),
  },
  {
    id: "green-eyes",
    trait: "green-eyes",
    title: "Plum makes green eyes stand out",
    advice: "Plum, mauve and wine sit opposite green, so your eyes look brighter.",
    applies: (face) => hexToLab(face.tone.eye).a < -2,
    types: ["eyeshadow"],
    judge: (s) => (s.cool ? { change: 0.14, reason: "Cool plums make green eyes stand out" } : null),
  },
  {
    id: "under-eye",
    trait: "shadows",
    title: "Warm concealer for shadows",
    advice: "Peach and warm tones cancel blue under-eye shadows better than pale pink.",
    types: ["concealer"],
    judge: (s) => (s.warm ? { change: 0.12, reason: "Warm tone cancels under-eye shadows" } : null),
  },
  {
    id: "redness-blush",
    trait: "redness",
    title: "Go easy on bright pink",
    advice: "Bright pink adds to natural redness. Muted rose or peach stays calmer.",
    types: ["blush"],
    judge: (s) => (s.bright ? { change: -0.08, warning: "Bright blush can add to redness" } : null),
  },
];

const rulesFor = (face: Face, t: Traits) => {
  const tags = traitTags(t);
  return GUIDE.filter((r) => (r.applies ? r.applies(face, t) : tags.includes(r.trait)));
};

/** What the guide says about one shade on one face. */
export function judgeShade(face: Face, t: Traits, type: string, hex: string) {
  const shade = readShade(hex);
  let change = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  for (const rule of rulesFor(face, t)) {
    if (!rule.types.includes(type)) continue;
    const verdict = rule.judge(shade, face, t, type);
    if (!verdict) continue;
    change += verdict.change;
    if (verdict.reason) reasons.push(verdict.reason);
    if (verdict.warning) warnings.push(verdict.warning);
  }
  return { change: Math.max(-0.3, Math.min(0.3, change)), reasons, warnings };
}

/** The advice for this face, for the Me screen. */
export function needsOf(face: Face, t: Traits) {
  return rulesFor(face, t).map(({ id, title, advice }) => ({ id, title, advice }));
}
