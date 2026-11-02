"use client";

// On-device makeup preview. It finds the face in the browser and tints the photo straight away, at no
// cost, so try-on still works with no YouCam key or when the units run out. YouCam gives the real render.

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Point } from "./capture";
import { deltaE, rgbToHex, hexToRgb } from "./color";
import type { Face } from "./face";

export type Layer = { type: string; hex: string };

const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_RIGHT = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_LEFT = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_RIGHT = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LID_LEFT = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LID_RIGHT = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const BROW_UNDER_LEFT = [46, 53, 52, 65, 55];
const BROW_UNDER_RIGHT = [276, 283, 282, 295, 285];
const CHEEK_APPLE = [205, 425];
const CHEEK_BONE = [116, 345];
const CHEEK_HOLLOW = [187, 411];

/** How strongly each kind of product shows. Layer order matters: skin first, lips last. */
const STRENGTH: Record<string, number> = { foundation: 0.34, concealer: 0.3, powder: 0.14, bronzer: 0.38, blush: 0.42, highlighter: 0.3, eyeshadow: 0.55, eyeliner: 0.8, brow: 0.3, lipstick: 0.74, lip_gloss: 0.42, lip_liner: 0.7 };
/** How much a gloss lifts the highlights already on the lips, which is what makes it read as wet. */
const GLOSS_SHINE = 0.42;
const ORDER = ["foundation", "concealer", "powder", "bronzer", "blush", "highlighter", "eyeshadow", "eyeliner", "brow", "lip_liner", "lipstick", "lip_gloss"];

let detector: Promise<FaceLandmarker> | null = null;

function loadDetector() {
  detector ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
      runningMode: "IMAGE",
      numFaces: 1,
    });
  })();
  return detector;
}

let videoDetector: Promise<FaceLandmarker> | null = null;

/** Face landmarks from a live camera frame, as fractions of the frame. Null when no face is in view. */
export async function detectInVideo(video: HTMLVideoElement, time: number) {
  videoDetector ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1,
    });
  })();
  const find = await videoDetector;
  return find.detectForVideo(video, time).faceLandmarks[0] ?? null;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo could not be opened"));
    image.src = url;
  });
}

type Scene = { image: HTMLImageElement; points: Point[] };
const scenes = new Map<string, Promise<Scene | null>>();

/** Finds the face once per photo. Returns null when there is no clear face. */
function sceneOf(url: string) {
  let scene = scenes.get(url);
  if (!scene) {
    scene = (async () => {
      const [image, find] = await Promise.all([loadImage(url), loadDetector()]);
      const face = find.detect(image).faceLandmarks[0];
      if (!face) return null;
      return { image, points: face.map((p) => ({ x: p.x * image.naturalWidth, y: p.y * image.naturalHeight })) };
    })();
    scenes.set(url, scene);
  }
  return scene;
}

function outline(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

const pick = (points: Point[], ids: number[]) => ids.map((i) => points[i]);
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Draws where a product goes. Drawing small and scaling up softens the edge in every browser. */
function maskFor(type: string, points: Point[], width: number, height: number) {
  const scale = ["lipstick", "lip_gloss", "lip_liner", "eyeliner"].includes(type) ? 0.5 : 0.2;
  const small = document.createElement("canvas");
  small.width = Math.ceil(width * scale);
  small.height = Math.ceil(height * scale);
  const ctx = small.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  const faceWidth = gap(points[234], points[454]);

  const cut = (ids: number[]) => {
    ctx.globalCompositeOperation = "destination-out";
    outline(ctx, pick(points, ids));
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };
  const spots = (ids: number[], radius: number) => {
    for (const i of ids) {
      const { x, y } = points[i];
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  };
  const lid = (under: number[], lidLine: number[]) => {
    const edge = pick(points, lidLine);
    const top = edge.map((p, i) => {
      const brow = points[under[Math.round((i / (edge.length - 1)) * (under.length - 1))]];
      return { x: p.x + (brow.x - p.x) * 0.55, y: p.y + (brow.y - p.y) * 0.55 };
    });
    outline(ctx, [...edge, ...top.reverse()]);
    ctx.fill();
  };

  if (["lipstick", "lip_gloss", "lip_liner"].includes(type)) {
    outline(ctx, pick(points, LIPS_OUTER));
    ctx.fill();
    cut(LIPS_INNER);
  } else if (["foundation", "concealer", "powder"].includes(type)) {
    // Skin products must melt away at the edge, or they end in a visible line across the forehead.
    const centre = points[1];
    outline(ctx, pick(points, FACE_OVAL).map((p) => ({ x: centre.x + (p.x - centre.x) * 0.86, y: centre.y + (p.y - centre.y) * 0.86 })));
    ctx.fill();
    const tiny = document.createElement("canvas");
    tiny.width = Math.max(8, Math.ceil(width * 0.03));
    tiny.height = Math.max(8, Math.ceil(height * 0.03));
    const soft = tiny.getContext("2d")!;
    soft.imageSmoothingQuality = "high";
    soft.drawImage(small, 0, 0, tiny.width, tiny.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, small.width, small.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tiny, 0, 0, small.width, small.height);
    ctx.scale(scale, scale);
    for (const part of [EYE_LEFT, EYE_RIGHT, BROW_LEFT, BROW_RIGHT, LIPS_OUTER]) cut(part);
  } else if (type === "blush") {
    spots(CHEEK_APPLE, faceWidth * 0.17);
  } else if (type === "bronzer") {
    spots(CHEEK_HOLLOW, faceWidth * 0.17);
  } else if (type === "highlighter") {
    spots(CHEEK_BONE, faceWidth * 0.1);
  } else if (type === "eyeshadow") {
    lid(BROW_UNDER_LEFT, LID_LEFT);
    lid(BROW_UNDER_RIGHT, LID_RIGHT);
  } else if (type === "brow") {
    outline(ctx, pick(points, BROW_LEFT));
    ctx.fill();
    outline(ctx, pick(points, BROW_RIGHT));
    ctx.fill();
  } else if (type === "eyeliner") {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = faceWidth * 0.008;
    for (const line of [LID_LEFT, LID_RIGHT]) {
      const edge = pick(points, line);
      ctx.beginPath();
      edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  const out = full.getContext("2d", { willReadFrequently: true })!;
  out.imageSmoothingQuality = "high";
  out.drawImage(small, 0, 0, width, height);
  return out.getImageData(0, 0, width, height).data;
}

const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

/** Tints one area with the shade while keeping the light and texture of the photo. */
function applyLayer(pixels: Uint8ClampedArray, mask: Uint8ClampedArray, hex: string, strength: number, shine = 0) {
  const [r, g, b] = hexToRgb(hex);
  let sum = 0;
  let weight = 0;
  for (let i = 3; i < mask.length; i += 4) {
    if (mask[i] > 128) {
      sum += luma(pixels, i - 3);
      weight++;
    }
  }
  const mean = weight ? sum / weight : 128;
  // A shade much lighter than what lies under it never covers fully, so it stays more see-through.
  const lift = Math.max(0, (0.2126 * r + 0.7152 * g + 0.0722 * b - mean) / 255);
  const cover = strength * (1 - 0.7 * lift);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = (mask[i + 3] / 255) * cover;
    if (alpha <= 0.004) continue;
    // Shine follows the highlights in the photo, so it is measured before the shade goes on.
    const original = luma(pixels, i) / mean;
    const shading = Math.max(0.55, Math.min(1.45, original));
    pixels[i] += (r * shading - pixels[i]) * alpha;
    pixels[i + 1] += (g * shading - pixels[i + 1]) * alpha;
    pixels[i + 2] += (b * shading - pixels[i + 2]) * alpha;
    if (shine) {
      const gleam = Math.max(0, Math.min(1, (original - 1.15) * 2.4)) * shine * (mask[i + 3] / 255);
      pixels[i] += (255 - pixels[i]) * gleam;
      pixels[i + 1] += (255 - pixels[i + 1]) * gleam;
      pixels[i + 2] += (255 - pixels[i + 2]) * gleam;
    }
  }
}

/** Returns a new image of the face wearing these layers, or null when no face was found. */
export async function previewLayers(photo: string, layers: Layer[]) {
  const scene = await sceneOf(photo);
  if (!scene) return null;
  const { image, points } = scene;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const ordered = [...layers].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  for (const layer of ordered) {
    if (!(layer.type in STRENGTH)) continue;
    applyLayer(frame.data, maskFor(layer.type, points, canvas.width, canvas.height), layer.hex, STRENGTH[layer.type], layer.type === "lip_gloss" ? GLOSS_SHINE : 0);
  }
  ctx.putImageData(frame, 0, 0);
  return new Promise<string | null>((resolve) => canvas.toBlob((blob) => resolve(blob && URL.createObjectURL(blob)), "image/jpeg", 0.92));
}

function medianColour(ctx: CanvasRenderingContext2D, spots: Point[], radius: number) {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (const { x, y } of spots) {
    const size = Math.max(1, Math.round(radius * 2));
    const { data } = ctx.getImageData(Math.max(0, x - radius), Math.max(0, y - radius), size, size);
    for (let i = 0; i < data.length; i += 4) for (const c of [0, 1, 2] as const) channels[c].push(data[i + c]);
  }
  const mid = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1] ?? 0;
  return rgbToHex(mid(channels[0]), mid(channels[1]), mid(channels[2]));
}

const SKIN_SPOTS = [205, 425, 50, 280, 151];

function contextOf(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx;
}

async function skinOfSides(sides: string[]) {
  const readings = await Promise.all(
    sides.map(async (url) => {
      const scene = await sceneOf(url).catch(() => null);
      if (!scene) return null;
      const radius = Math.max(2, gap(scene.points[234], scene.points[454]) * 0.02);
      return medianColour(contextOf(scene.image), pick(scene.points, SKIN_SPOTS), radius);
    }),
  );
  return readings.filter((hex): hex is string => !!hex);
}

function fuseColours(hexes: string[]) {
  const rgb = hexes.map(hexToRgb);
  const mid = (c: 0 | 1 | 2) => rgb.map((v) => v[c]).sort((a, b) => a - b)[rgb.length >> 1];
  return rgbToHex(mid(0), mid(1), mid(2));
}

/** Compares the skin colour across angles. A large difference means the light was uneven. */
export async function lightIsUneven(front: string, sides: string[]) {
  const scene = await sceneOf(front).catch(() => null);
  if (!scene) return false;
  const radius = Math.max(2, gap(scene.points[234], scene.points[454]) * 0.02);
  const middle = medianColour(contextOf(scene.image), pick(scene.points, SKIN_SPOTS), radius);
  return (await skinOfSides(sides)).some((hex) => deltaE(hex, middle) > 9);
}

/**
 * A quick reading made on the device, for when YouCam cannot run. It measures colours and rough shapes
 * from the photo. It cannot read skin condition, so those scores stay neutral and raise no advice.
 */
export async function readFaceOnDevice(photo: string, sides: string[] = []): Promise<Face | null> {
  const scene = await sceneOf(photo);
  if (!scene) return null;
  const { image, points } = scene;
  const ctx = contextOf(image);

  const faceWidth = gap(points[234], points[454]);
  const faceHeight = gap(points[10], points[152]);
  const radius = Math.max(2, faceWidth * 0.02);
  const lipHeight = gap(points[0], points[17]) / faceHeight;
  const ratio = faceHeight / faceWidth;
  const top = points[10];

  return {
    source: "device",
    tone: {
      // One photo carries the light of that moment, so every angle gets a say in the skin colour.
      skin: fuseColours([medianColour(ctx, pick(points, SKIN_SPOTS), radius), ...(await skinOfSides(sides))]),
      lip: medianColour(ctx, pick(points, [0, 17, 13, 14, 37, 267]), radius * 0.5),
      eye: medianColour(ctx, pick(points, [468, 473]), radius * 0.4),
      brow: medianColour(ctx, pick(points, [105, 334, 66, 296]), radius * 0.4),
      hair: medianColour(ctx, [{ x: top.x, y: Math.max(radius, top.y - faceHeight * 0.12) }], radius),
    },
    skin: { oiliness: 70, moisture: 70, radiance: 70, redness: 70, texture: 70, pore: 70, wrinkle: 70, acne: 70, dark_circle: 70 },
    shape: {
      faceShape: ratio > 1.42 ? "Oblong" : ratio < 1.2 ? "Round" : "Oval",
      eyeShape: "Unknown",
      eyelid: "Unknown",
      eyebrowThickness: "Unknown",
      lipShape: lipHeight < 0.075 ? "Thin" : lipHeight > 0.105 ? "Full" : "Average",
      cheekbones: "Unknown",
    },
  };
}

/** Selfies from phones can be huge, so they are reduced before leaving the device. */
export async function prepareSelfie(file: File, longSide = 1280) {
  const url = URL.createObjectURL(file);
  const image = await loadImage(url);
  URL.revokeObjectURL(url);
  const scale = Math.min(1, longSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("The photo could not be prepared");
  return new File([blob], "selfie.jpg", { type: "image/jpeg" });
}
