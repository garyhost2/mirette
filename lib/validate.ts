// Checks what arrives from a browser. A face lives on the shopper's device and comes back with each
// request, so the server treats it as untrusted input before any maths or database write.

import type { Face } from "./face";
import type { Signals } from "./learn";

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 120;
const TONES = ["skin", "lip", "eye", "brow", "hair"] as const;
const SCORES = ["oiliness", "moisture", "radiance", "redness", "texture", "pore", "wrinkle", "acne", "dark_circle"] as const;
const SHAPES = ["faceShape", "eyeShape", "eyelid", "eyebrowThickness", "lipShape", "cheekbones"] as const;
const SIGNALS = ["optical", "physical", "creator", "graph", "popularity"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isText = (value: unknown) => typeof value === "string" && value.length <= MAX_TEXT;

export const isHex = (value: unknown): value is string => typeof value === "string" && HEX.test(value);

export function isFace(value: unknown): value is Face {
  if (!isRecord(value)) return false;
  const { tone, skin, shape } = value;
  if (!isRecord(tone) || !isRecord(skin) || !isRecord(shape)) return false;
  return TONES.every((k) => isHex(tone[k])) && SCORES.every((k) => Number.isFinite(skin[k])) && SHAPES.every((k) => isText(shape[k]));
}

/** Signals feed the model directly, so a value outside 0 to 1 could push its weights anywhere. */
export function isSignals(value: unknown): value is Signals {
  if (!isRecord(value)) return false;
  return SIGNALS.every((k) => {
    const signal = value[k];
    return typeof signal === "number" && signal >= 0 && signal <= 1;
  });
}
