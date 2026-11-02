// Creator match. A look only transfers if the traits that matter for that look are shared, so the
// score is per look, not per person. It compares colours and shapes and never identifies anyone.

import { hexToLab } from "./color";
import { colourCloseness, traitsOf, type Face } from "./face";

export type LookKind = "lip" | "eye" | "face";

type Part = { label: string; weight: number; value: number };

const same = (a: string, b: string) => (a.toLowerCase() === b.toLowerCase() ? 1 : 0);
const closeL = (a: string, b: string) => Math.max(0, 1 - Math.abs(hexToLab(a).L - hexToLab(b).L) / 34);

function parts(you: Face, them: Face, kind: LookKind): Part[] {
  const a = traitsOf(you);
  const b = traitsOf(them);
  const undertone = a.undertone === b.undertone ? 1 : a.undertone === "neutral" || b.undertone === "neutral" ? 0.6 : 0.2;
  const contrast = Math.max(0, 1 - Math.abs(a.contrast - b.contrast) / 40);
  const depth = { label: "skin depth", value: closeL(you.tone.skin, them.tone.skin) };
  const tone = { label: "undertone", value: undertone };

  if (kind === "lip") {
    return [
      { label: "lip shape", weight: 0.3, value: same(you.shape.lipShape, them.shape.lipShape) },
      { label: "natural lip colour", weight: 0.25, value: colourCloseness(you.tone.lip, them.tone.lip) },
      { ...depth, weight: 0.3 },
      { ...tone, weight: 0.15 },
    ];
  }
  if (kind === "eye") {
    return [
      { label: "eyelid type", weight: 0.35, value: same(you.shape.eyelid, them.shape.eyelid) },
      { label: "eye shape", weight: 0.25, value: same(you.shape.eyeShape, them.shape.eyeShape) },
      { label: "eye colour", weight: 0.2, value: colourCloseness(you.tone.eye, them.tone.eye) },
      { label: "contrast", weight: 0.2, value: contrast },
    ];
  }
  const texture = Math.max(0, 1 - Math.abs(you.skin.texture - them.skin.texture) / 50);
  return [
    { ...depth, weight: 0.4 },
    { ...tone, weight: 0.3 },
    { label: "skin texture", weight: 0.15, value: texture },
    { label: "face shape", weight: 0.15, value: same(you.shape.faceShape, them.shape.faceShape) },
  ];
}

export function matchLook(you: Face, them: Face, kind: LookKind) {
  const list = parts(you, them, kind);
  const score = list.reduce((sum, p) => sum + p.weight * p.value, 0);
  const closest = [...list].sort((a, b) => b.weight * b.value - a.weight * a.value).slice(0, 2);
  return {
    score: Math.round(score * 100),
    reasons: closest.map((p) => (p.value >= 0.99 ? `Same ${p.label}` : `${Math.round(p.value * 100)}% ${p.label} match`)),
  };
}

/** Eye and lip looks are read from their products, anything else counts as a face look. */
export function kindOfLook(types: string[]): LookKind {
  const first = types[0] ?? "";
  if (types.some((t) => ["eyeshadow", "eyeliner"].includes(t))) return "eye";
  if (["lipstick", "lip_gloss"].some((t) => types.includes(t)) && !["blush", "bronzer"].includes(first)) return "lip";
  return "face";
}
