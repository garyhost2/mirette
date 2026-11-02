// Sample creators, invented for the demo. They are always labelled as samples in the app.
// Real creators replace them only with their permission.

import type { Face, Shape, SkinScores, Tone } from "./face";

export type Creator = {
  id: string;
  name: string;
  style: string;
  /** The colours and scores Mirette would measure from a creator's face. */
  tone: Tone;
  shape: Shape;
  skin: SkinScores;
  /** An AI-made portrait of nobody real. See public/faces/CREDITS.md. */
  face?: string;
};

export type Look = {
  id: string;
  creatorId: string;
  name: string;
  story: string;
  /** Product types in this look, in the order they go on. */
  needs: string[];
  /** Which ranked product to take, so looks do not all show the same items. */
  pick: number;
  /** The colour the look is known for, as the creator wears it. This is what gets translated. */
  signature: { type: string; hex: string; opacity: number };
  avoidBrand?: string;
};

const skin = (oiliness: number, moisture: number, texture: number): SkinScores => ({
  oiliness,
  moisture,
  texture,
  radiance: 72,
  redness: 74,
  pore: texture,
  wrinkle: 80,
  acne: 82,
  dark_circle: 68,
});

const shape = (faceShape: string, eyeShape: string, eyelid: string, lipShape: string): Shape => ({
  faceShape,
  eyeShape,
  eyelid,
  lipShape,
  eyebrowThickness: "Medium",
  cheekbones: "High Cheekbone",
});

export const CREATORS: Creator[] = [
  {
    id: "ines",
    name: "Inès Marchand",
    style: "Bare skin, one strong lip",
    face: "/faces/ines.jpg",
    tone: { skin: "#d9ae88", lip: "#a8524c", eye: "#6b4a2c", brow: "#3a2a20", hair: "#2c1d17" },
    shape: shape("Oval", "Almond", "Double-lid", "Full"),
    skin: skin(70, 62, 74),
  },
  {
    id: "amara",
    name: "Amara Diallo",
    style: "Glow, bronze and gold",
    face: "/faces/amara.jpg",
    tone: { skin: "#7a4c34", lip: "#7c3a34", eye: "#2c1a12", brow: "#1a1210", hair: "#14100e" },
    shape: shape("Heart", "Almond", "Double-lid", "Full"),
    skin: skin(52, 70, 78),
  },
  {
    id: "lucie",
    name: "Lucie Fontaine",
    style: "Soft pinks, clean lashes",
    face: "/faces/lucie.jpg",
    tone: { skin: "#f0d9c6", lip: "#c97f7c", eye: "#6f7f52", brow: "#6a4e36", hair: "#8a6a4a" },
    shape: shape("Oval", "Round", "Double-lid", "Thin"),
    skin: skin(78, 50, 70),
  },
  {
    id: "salma",
    name: "Salma Haddad",
    style: "Sculpted eyes, warm nudes",
    face: "/faces/sample.jpg",
    tone: { skin: "#c49a78", lip: "#b5786c", eye: "#4a2e1c", brow: "#2a1c14", hair: "#1c1410" },
    shape: shape("Diamond", "Almond", "Hooded-lid", "Average"),
    skin: skin(60, 66, 72),
  },
  {
    id: "chloe",
    name: "Chloé Nguyen",
    style: "Skin first, a flush of colour",
    tone: { skin: "#e8c8a6", lip: "#b8605e", eye: "#2e1e16", brow: "#1e1612", hair: "#1a1412" },
    shape: shape("Round", "Narrow", "Single-lid", "Thin"),
    skin: skin(58, 64, 80),
  },
  {
    id: "noor",
    name: "Noor Benali",
    style: "Evening glamour",
    tone: { skin: "#a4704a", lip: "#6e2632", eye: "#2a1a10", brow: "#140e0c", hair: "#0f0c0b" },
    shape: shape("Square", "Almond", "Deep-Set", "Full"),
    skin: skin(66, 58, 68),
  },
];

const ALL_LOOKS: Look[] = [
  { id: "rue-rouge", creatorId: "ines", name: "Rue Rouge", story: "Skin left almost bare, so the lip does everything.", needs: ["foundation", "lipstick", "mascara"], pick: 0, signature: { type: "lipstick", hex: "#a81e28", opacity: 0.85 } },
  { id: "or-chaud", creatorId: "amara", name: "Or Chaud", story: "Warm bronze across the cheeks and a gold lift at the eye.", needs: ["bronzer", "highlighter", "lip_gloss"], pick: 1, signature: { type: "lip_gloss", hex: "#8a4a3c", opacity: 0.55 } },
  { id: "matin-rose", creatorId: "lucie", name: "Matin Rose", story: "The face you have after good news.", needs: ["blush", "lip_gloss", "mascara"], pick: 2, signature: { type: "lip_gloss", hex: "#cf6f86", opacity: 0.55 } },
  { id: "regard-fume", creatorId: "salma", name: "Regard Fumé", story: "A smoked eye that stays soft in daylight.", needs: ["eyeshadow", "eyeliner", "concealer"], pick: 1, signature: { type: "eyeshadow", hex: "#6a4634", opacity: 0.7 } },
  { id: "peau-nue", creatorId: "chloe", name: "Peau Nue", story: "Five minutes, and nothing looks applied.", needs: ["concealer", "blush", "brow"], pick: 3, signature: { type: "blush", hex: "#d98a80", opacity: 0.35 } },
  { id: "minuit", creatorId: "noor", name: "Minuit", story: "Deep lip, sharp liner, for after dark.", needs: ["lipstick", "eyeliner", "highlighter"], pick: 2, signature: { type: "lipstick", hex: "#5e1a2a", opacity: 0.85 } },
];

export const creatorOf = (look: Look) => CREATORS.find((c) => c.id === look.creatorId)!;

/** Only creators with a portrait appear, so no screen in the feed is left empty. */
export const LOOKS = ALL_LOOKS.filter((look) => creatorOf(look).face);

export const faceOfCreator = (c: Creator): Face => ({ tone: c.tone, shape: c.shape, skin: c.skin, source: "sample" });

/** The saved reading for the app's sample face, used until a live YouCam scan replaces it. */
export const SAMPLE_FACE: Face = {
  source: "sample",
  tone: { skin: "#c49a78", lip: "#b5786c", eye: "#4a2e1c", brow: "#2a1c14", hair: "#1c1410" },
  shape: { faceShape: "Oval", eyeShape: "Almond", eyelid: "Double-lid", eyebrowThickness: "Medium", lipShape: "Full", cheekbones: "High Cheekbone" },
  skin: { oiliness: 48, moisture: 66, radiance: 62, redness: 76, texture: 60, pore: 54, wrinkle: 84, acne: 80, dark_circle: 58 },
};

/** Faces anyone can try without a scan, so matches can be seen changing with no YouCam units spent. */
export const SAMPLES = [
  { id: "sample", photo: "/faces/sample.jpg", face: SAMPLE_FACE },
  ...CREATORS.filter((c) => c.face && c.face !== "/faces/sample.jpg").map((c) => ({ id: c.id, photo: c.face!, face: faceOfCreator(c) })),
];
