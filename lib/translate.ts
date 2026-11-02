// Look translation. Copying a creator's shade fails across skin tones, because people do not see a
// lip colour alone: they see it against the skin. So a look is stored as an effect on the face, and
// translated into whichever real shade gives the same effect on the shopper's own skin.
//
// The effect has three parts: contrast against the skin, hue, and strength of colour.
// Contrast uses the facial contrast measure from Porcheron et al., (feature - skin) / (feature + skin).
// See docs/RESEARCH.md. This is Mirette's own method and has not been tested on real shoppers yet.

import { hexToLab, type Lab } from "./color";
import type { Face } from "./face";
import { onFaceLab } from "./suit";

export type Effect = { contrast: number; hue: number; chroma: number };
export type Candidate = { productId: string; shade: string; hex: string; opacity: number };

const LIPS = new Set(["lipstick", "lip_gloss", "lip_liner"]);
const chroma = (l: Lab) => Math.hypot(l.a, l.b);
const hue = (l: Lab) => ((Math.atan2(l.b, l.a) * 180) / Math.PI + 360) % 360;

/** What a shade does on one face, measured against that face's skin. */
export function effectOn(face: Face, type: string, hex: string, opacity: number): Effect {
  const skin = hexToLab(face.tone.skin);
  const base = LIPS.has(type) ? face.tone.lip : face.tone.skin;
  const onFace = onFaceLab(base, hex, opacity);
  return { contrast: (onFace.L - skin.L) / (onFace.L + skin.L), hue: hue(onFace), chroma: chroma(onFace) - chroma(skin) };
}

/** How far two effects are apart. Contrast leads, because it is what the eye reads first. */
export function effectGap(a: Effect, b: Effect) {
  const turn = Math.abs(a.hue - b.hue);
  const hueGap = Math.min(turn, 360 - turn);
  return Math.hypot((a.contrast - b.contrast) * 100, hueGap * 0.4, (a.chroma - b.chroma) * 0.5);
}

/** The real shade that gives the shopper the same effect as the creator's shade gives the creator. */
export function translate(from: Face, to: Face, type: string, hex: string, opacity: number, candidates: Candidate[]) {
  const wanted = effectOn(from, type, hex, opacity);
  let best: (Candidate & { gap: number }) | null = null;
  for (const c of candidates) {
    const gap = effectGap(wanted, effectOn(to, type, c.hex, c.opacity));
    if (!best || gap < best.gap) best = { ...c, gap };
  }
  return best;
}
