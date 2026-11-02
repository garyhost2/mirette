// Colour science for shade matching. All comparisons happen in CIELAB, because equal
// distances there look equally different to a person, which RGB distances do not.

export type Lab = { L: number; a: number; b: number };
export type Undertone = "warm" | "neutral" | "cool";
export type Depth = "fair" | "light" | "medium" | "tan" | "deep";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Bad hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  // sRGB to XYZ, D65 white point
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

/** CIEDE2000 colour difference: about 2 is hard to see, above 5 reads as a different shade. */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(c1.a, c1.b);
  const C2 = Math.hypot(c2.a, c2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1 = (1 + G) * c1.a;
  const a2 = (1 + G) * c2.a;
  const C1p = Math.hypot(a1, c1.b);
  const C2p = Math.hypot(a2, c2.b);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1 = hue(c1.b, a1);
  const h2 = hue(c2.b, a2);

  const dL = c2.L - c1.L;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);

  const Lbar = (c1.L + c2.L) / 2;
  const Cpbar = (C1p + C2p) / 2;
  let hbar = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hbar = (h1 + h2) / 2;
    else hbar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbar - 30) * rad) +
    0.24 * Math.cos(2 * hbar * rad) +
    0.32 * Math.cos((3 * hbar + 6) * rad) -
    0.2 * Math.cos((4 * hbar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    (dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh),
  );
}

export function labToHex({ L, a, b }: Lab): string {
  const fy = (L + 16) / 116;
  const inverse = (t: number) => (t > 6 / 29 ? t ** 3 : (108 / 841) * (t - 4 / 29));
  const x = 0.95047 * inverse(fy + a / 500);
  const y = inverse(fy);
  const z = 1.08883 * inverse(fy - b / 200);
  const gamma = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);
  return rgbToHex(
    gamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    gamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    gamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  );
}

export function deltaE(hexA: string, hexB: string): number {
  return deltaE2000(hexToLab(hexA), hexToLab(hexB));
}

/** Our own estimate from the Lab hue angle; YouCam returns the colours, not an undertone. */
export function undertoneOf(skinHex: string): Undertone {
  const { a, b } = hexToLab(skinHex);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue >= 62) return "warm";
  if (hue <= 50) return "cool";
  return "neutral";
}

/** Individual Typology Angle, a skin tone measure from Lab values that maps well to the Monk scale. */
export function ita(hex: string): number {
  const { L, b } = hexToLab(hex);
  return (Math.atan2(L - 50, b) * 180) / Math.PI;
}

/** The standard ITA bands, with brown and dark joined as deep. */
export function depthOf(skinHex: string): Depth {
  const angle = ita(skinHex);
  if (angle > 55) return "fair";
  if (angle > 41) return "light";
  if (angle > 28) return "medium";
  if (angle > 10) return "tan";
  return "deep";
}

/** A rough warm/cool reading of any product colour, for harmony with the shopper's undertone. */
export function temperatureOf(hex: string): number {
  const { a, b } = hexToLab(hex);
  return Math.max(-1, Math.min(1, b / (Math.hypot(a, b) + 8)));
}

/** Plain colour words from Lab values. Lips and cheeks have their own, because a shopper names them differently. */
export function colourWord(lab: Lab, group: string) {
  const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  const chroma = Math.hypot(lab.a, lab.b);
  if (group === "eyes") {
    if (chroma < 8) return lab.L < 35 ? "blacks" : "greys";
    return lab.L > 65 ? "golds and creams" : lab.L > 40 ? "bronzes" : "browns";
  }
  if (group === "face") return lab.L > 75 ? "fair tones" : lab.L > 60 ? "light tones" : lab.L > 45 ? "medium tones" : lab.L > 30 ? "tan tones" : "deep tones";
  if (chroma < 16 || (lab.L > 62 && chroma < 28)) return lab.L > 55 ? "nudes" : "browns";
  if (hue > 340 || hue < 8) return lab.L > 58 ? "pinks" : lab.L > 34 ? "roses" : "berries";
  if (hue < 32) return lab.L > 58 ? "corals" : "reds";
  if (hue < 60) return lab.L > 55 ? "peaches" : "terracottas";
  return "nudes";
}

/** The word for one shade on a rail. Eye products also come in greens, blues and plums. */
export function shadeWord(lab: Lab, group: string) {
  const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  if (group === "eyes" && Math.hypot(lab.a, lab.b) >= 8) {
    if (hue >= 100 && hue < 190) return "greens";
    if (hue >= 190 && hue < 290) return "blues";
    if (hue >= 290 && hue < 340) return "plums";
  }
  return colourWord(lab, group);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: string, b: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * weight,
    g1 + (g2 - g1) * weight,
    b1 + (b2 - b1) * weight,
  );
}

/**
 * Paint a store from a shopper's own colours. Keeps text readable on any skin tone by
 * choosing the ink that clears 4.5:1 and pushing the accent until it clears 3:1.
 */
export function paletteFrom(tone: { skin: string; lip: string; hair: string }) {
  const ground = tone.skin;
  const dark = mix(tone.hair, "#0d0b0a", 0.72);
  const ink = contrastRatio(dark, ground) >= 4.5 ? dark : "#fbf6f1";
  const surface = mix(ground, ink === dark ? "#ffffff" : "#000000", 0.24);
  let accent = tone.lip;
  const pushTo = ink === dark ? "#3a0612" : "#ffe9df";
  for (let i = 0; i < 12 && contrastRatio(accent, ground) < 3; i++) accent = mix(accent, pushTo, 0.14);
  const onAccent = contrastRatio("#ffffff", accent) >= 4.5 ? "#ffffff" : "#120d0b";
  return { ground, surface, ink, accent, onAccent };
}
