// What Mirette knows about a face, and the traits worked out from it.
// Colours and scores come from YouCam. Everything here is a cosmetic estimate, never a medical one.

import { deltaE, depthOf, hexToLab, undertoneOf, type Depth, type Undertone } from "./color";

export type Tone = { skin: string; lip: string; eye: string; brow: string; hair: string };

/** YouCam skin scores, 0 to 100. Higher means better in that area. */
export type SkinScores = {
  oiliness: number;
  moisture: number;
  radiance: number;
  redness: number;
  texture: number;
  pore: number;
  wrinkle: number;
  acne: number;
  dark_circle: number;
};

export type Shape = {
  faceShape: string;
  eyeShape: string;
  eyelid: string;
  eyebrowThickness: string;
  lipShape: string;
  cheekbones: string;
};

export type Face = {
  tone: Tone;
  skin: SkinScores;
  shape: Shape;
  /** "live" came from a real YouCam scan. "device" is a quick reading made in the browser. */
  source: "live" | "device" | "sample" | "simulated";
};

export type Traits = {
  depth: Depth;
  undertone: Undertone;
  skinL: number;
  /** L* gap between skin and the darkest of hair and brow: how strong a colour the face carries. */
  contrast: number;
  oily: boolean;
  dry: boolean;
  textured: boolean;
  redness: boolean;
  shadows: boolean;
  hoodedLids: boolean;
  thinLips: boolean;
  fullLips: boolean;
};

const LOW = 55;

export function traitsOf(face: Face): Traits {
  const { tone, skin, shape } = face;
  const skinL = hexToLab(tone.skin).L;
  const darkest = Math.min(hexToLab(tone.hair).L, hexToLab(tone.brow).L);
  const lid = shape.eyelid.toLowerCase();
  const lips = shape.lipShape.toLowerCase();
  return {
    depth: depthOf(tone.skin),
    undertone: undertoneOf(tone.skin),
    skinL,
    contrast: Math.abs(skinL - darkest),
    oily: skin.oiliness < LOW,
    dry: skin.moisture < LOW,
    textured: (skin.texture + skin.pore + skin.wrinkle) / 3 < LOW,
    redness: skin.redness < LOW,
    shadows: skin.dark_circle < LOW,
    hoodedLids: lid.includes("hood") || lid.includes("single") || lid.includes("deep"),
    thinLips: lips.includes("thin"),
    fullLips: lips.includes("full") || lips.includes("heavy"),
  };
}

/** The trait names the graph and the model use, for example "oily" or "depth:deep". */
export function traitTags(t: Traits): string[] {
  const flags: [string, boolean][] = [
    ["oily", t.oily],
    ["dry", t.dry],
    ["textured", t.textured],
    ["redness", t.redness],
    ["shadows", t.shadows],
    ["hooded", t.hoodedLids],
    ["thin-lips", t.thinLips],
    ["full-lips", t.fullLips],
    ["high-contrast", t.contrast >= 40],
    ["low-contrast", t.contrast < 25],
  ];
  return [`depth:${t.depth}`, `undertone:${t.undertone}`, ...flags.filter(([, on]) => on).map(([tag]) => tag)];
}

export const TRAIT_LABEL: Record<string, string> = {
  oily: "oily skin",
  dry: "dry skin",
  textured: "visible texture",
  redness: "redness",
  shadows: "under-eye shadows",
  hooded: "hooded lids",
  "thin-lips": "thinner lips",
  "full-lips": "fuller lips",
  "high-contrast": "high contrast",
  "low-contrast": "soft contrast",
};

/** Colour distance as a 0-1 similarity: about 3 looks the same, about 30 looks unrelated. */
export const colourCloseness = (a: string, b: string) => Math.max(0, 1 - deltaE(a, b) / 30);
