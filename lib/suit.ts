// Decides how well a shade suits a face, as two scores from 0 to 1 with plain reasons.
// Optical: how the colour looks once it is on this skin. Physical: how the formula sits on this face.
// These rules are starting points from makeup practice. The model in learn.ts corrects them.

import { deltaE, hexToLab, labToHex, temperatureOf, type Lab } from "./color";
import { traitsOf, type Face, type Traits } from "./face";
import { judgeShade } from "./guide";

export type Attributes = {
  finish: string | null;
  coverage: string | null;
  formula: string | null;
  claims: string[];
  opacity: number;
};

export type SuitProduct = { type: string; attributes: Attributes };
export type Suit = { optical: number; physical: number; onFace: string; reasons: string[]; warnings: string[] };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const FOUNDATIONS = new Set(["foundation", "concealer", "powder"]);
const CHEEKS = new Set(["blush", "bronzer", "highlighter"]);
const LIPS = new Set(["lipstick", "lip_gloss", "lip_liner"]);
const LINERS = new Set(["eyeliner", "mascara", "brow"]);

/**
 * What the eye sees. Makeup sits as separate particles over partly exposed skin, not as a solid film,
 * so colour moves along a smooth curve of coverage (Park et al. 2026). Lighter products over darker
 * skin reach their full effect sooner. The form is theirs. The strength of that last effect is our
 * estimate, and their measurements were of foundation only.
 */
export function onFaceLab(base: string, product: string, coverage: number): Lab {
  const from = hexToLab(base);
  const to = hexToLab(product);
  const eased = coverage * coverage * (3 - 2 * coverage);
  const lift = Math.max(-40, Math.min(40, to.L - from.L));
  const weight = eased ** (1 - lift * 0.006);
  return { L: from.L + (to.L - from.L) * weight, a: from.a + (to.a - from.a) * weight, b: from.b + (to.b - from.b) * weight };
}

export function onFaceColour(base: string, product: string, coverage: number) {
  return labToHex(onFaceLab(base, product, coverage));
}

/** 1 when warm-on-warm or cool-on-cool, lower as the two pull apart. */
function harmony(hex: string, t: Traits) {
  const temp = temperatureOf(hex);
  if (t.undertone === "warm") return clamp(0.5 + temp * 0.5);
  if (t.undertone === "cool") return clamp(0.5 - temp * 0.5);
  return clamp(1 - Math.abs(temp) * 0.6);
}

function opticalFor(face: Face, t: Traits, p: SuitProduct, hex: string, warnings: string[]): { score: number; onFace: string; why: string[] } {
  const { opacity } = p.attributes;
  const why: string[] = [];

  if (FOUNDATIONS.has(p.type)) {
    const onFace = onFaceColour(face.tone.skin, hex, opacity);
    const gap = deltaE(onFace, face.tone.skin);
    const direct = deltaE(hex, face.tone.skin);
    // On-face distance forgives sheer products. The direct distance stops a far-off shade scoring well.
    const score = clamp(1 - (gap * 0.7 + direct * 0.3) / 14);
    if (direct <= 4) why.push("Reads as your own skin");
    else if (direct > 9) warnings.push("Visibly off your skin tone");
    return { score, onFace, why };
  }

  if (LIPS.has(p.type)) {
    const onFace = onFaceColour(face.tone.lip, hex, opacity);
    const contrast = Math.abs(hexToLab(onFace).L - t.skinL);
    // A strong face carries a strong lip. Soft faces look best nearer their natural contrast.
    const target = 14 + t.contrast * 0.42;
    const fit = clamp(1 - Math.abs(contrast - target) / 36);
    const score = clamp(0.62 * fit + 0.38 * harmony(hex, t));
    if (fit > 0.8) why.push(t.contrast >= 40 ? "Strong enough for your contrast" : "Keeps your natural contrast");
    if (harmony(hex, t) > 0.72) why.push(`Suits your ${t.undertone} undertone`);
    return { score, onFace, why };
  }

  if (CHEEKS.has(p.type)) {
    const onFace = onFaceColour(face.tone.skin, hex, opacity);
    const lift = hexToLab(onFace).L - t.skinL;
    const want = p.type === "highlighter" ? 7 : p.type === "bronzer" ? -9 : -3;
    const fit = clamp(1 - Math.abs(lift - want) / 16);
    const visible = clamp(deltaE(onFace, face.tone.skin) / 7);
    const score = clamp(0.5 * fit + 0.25 * visible + 0.25 * harmony(hex, t));
    if (t.depth === "deep" && hexToLab(hex).L > t.skinL + 26) warnings.push("May look ashy on deeper skin");
    else if (score > 0.7) why.push(`Shows well on ${t.depth} skin`);
    return { score, onFace, why };
  }

  if (LINERS.has(p.type)) {
    const reference = p.type === "brow" ? face.tone.brow : face.tone.hair;
    const gap = deltaE(hex, reference);
    const score = clamp(1 - gap / 34);
    if (gap < 10) why.push(p.type === "brow" ? "Close to your brows" : "Goes with your hair colour");
    return { score, onFace: hex, why };
  }

  // Eyeshadow: colours across the wheel from the iris make the eye stand out.
  const eye = hexToLab(face.tone.eye);
  const shade = hexToLab(hex);
  const turn = Math.abs(Math.atan2(eye.b, eye.a) - Math.atan2(shade.b, shade.a)) / Math.PI;
  const across = turn > 1 ? 2 - turn : turn;
  const score = clamp(0.55 * across + 0.45 * harmony(hex, t));
  if (across > 0.6) why.push("Makes your eye colour stand out");
  return { score, onFace: hex, why };
}

function physicalFor(t: Traits, p: SuitProduct, warnings: string[]): { score: number; why: string[] } {
  const { finish, formula, claims, coverage } = p.attributes;
  const why: string[] = [];
  let score = 0.55;
  const add = (amount: number, reason?: string) => {
    score += amount;
    if (reason) why.push(reason);
  };
  const skinProduct = FOUNDATIONS.has(p.type) || CHEEKS.has(p.type);

  if (skinProduct) {
    if (t.oily) {
      if (finish === "matte" || claims.includes("oilfree")) add(0.18, "Matte finish suits oily skin");
      if (finish === "dewy") add(-0.14);
      if (p.type === "powder") add(0.1);
    }
    if (t.dry) {
      if (finish === "dewy" || claims.includes("hydrating")) add(0.18, "Hydrating formula for dry skin");
      if (finish === "matte" || formula === "powder") add(-0.14);
    }
    if (t.textured) {
      if (claims.includes("blurring")) add(0.14, "Blurs visible texture");
      if (finish === "shimmer") {
        add(-0.16);
        warnings.push("Shimmer can catch on texture");
      }
    }
    if (t.redness && (coverage === "medium" || coverage === "full")) add(0.08, "Enough coverage for redness");
  }
  if (p.type === "concealer" && t.shadows) add(0.14, "Helps under-eye shadows");
  if (LIPS.has(p.type)) {
    if (t.thinLips && (finish === "gloss" || p.type === "lip_gloss")) add(0.18, "Gloss adds fullness to thinner lips");
    if (t.fullLips && finish === "matte") add(0.1, "Matte sits well on fuller lips");
    if (t.dry && finish === "matte" && claims.includes("longwear")) add(-0.12);
    if (t.dry && claims.includes("hydrating")) add(0.08);
  }
  if (p.type === "eyeshadow" || p.type === "eyeliner" || p.type === "mascara") {
    if (t.hoodedLids) {
      if (claims.includes("waterproof") || claims.includes("longwear")) add(0.18, "Stays put on hooded lids");
      if (finish === "shimmer") add(-0.08);
    }
  }
  return { score: clamp(score), why };
}

export function suit(face: Face, product: SuitProduct, hex: string): Suit {
  const traits = traitsOf(face);
  const warnings: string[] = [];
  const optical = opticalFor(face, traits, product, hex, warnings);
  const guide = judgeShade(face, traits, product.type, hex);
  warnings.push(...guide.warnings);
  const physical = physicalFor(traits, product, warnings);
  return {
    optical: clamp(optical.score + guide.change),
    physical: physical.score,
    onFace: optical.onFace,
    reasons: [...guide.reasons, ...optical.why, ...physical.why],
    warnings,
  };
}
