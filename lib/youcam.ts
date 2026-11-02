// Server-side client for the YouCam API. The key never reaches the browser.
// Every AI call follows the same shape: register a file, PUT the bytes, create a task, poll it.

import type { Shape, SkinScores, Tone } from "./face";

const BASE = process.env.YOUCAM_BASE ?? "https://yce-api-01.makeupar.com/s2s/v2.0";

export type TaskKind = "skin" | "tone" | "face" | "makeup";

const TASK_PATH: Record<TaskKind, string> = {
  skin: "task/skin-analysis",
  tone: "task/skin-tone-analysis",
  face: "task/face-attr-analysis",
  makeup: "task/makeup-vto",
};

/** Units per successful task, from the docs. */
export const UNIT_COST: Record<TaskKind, number> = { skin: 14, tone: 20, face: 20, makeup: 1 };

/** Request names of the face attributes we use. Up to 14 stays in the 20-unit tier. */
export const FACE_FEATURES = ["faceShape", "eyeShape", "eyeSize", "eyeAngle", "eyeDistance", "eyelid", "eyebrowThickness", "lipShape", "cheekbones"];

/** 11 concerns stay in the 9-12 tier (14 units). Adding more costs more and adds little here. */
export const SKIN_ACTIONS = [
  "acne",
  "moisture",
  "oiliness",
  "pore",
  "redness",
  "radiance",
  "age_spot",
  "wrinkle",
  "texture",
  "dark_circle_v2",
  "skin_type",
];

export class YouCamError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const hasKey = () => Boolean(process.env.YOUCAM_API_KEY);

/** What to tell the shopper when a call fails. The details stay in the server log. */
export function failureOf(error: unknown, fallback: string) {
  if (!(error instanceof YouCamError)) {
    console.error("YouCam call failed:", error);
    return { message: fallback, status: 500 };
  }
  console.error(`YouCam call failed: ${error.status} ${error.code ?? ""} ${error.message}`);
  return { message: error.message, status: error.status };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError("YOUCAM_API_KEY is not set", 503, "NoKey");
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new YouCamError(body?.error ?? `YouCam returned ${res.status}`, res.status, body?.error_code);
  }
  return body as T;
}

export async function uploadImage(bytes: Uint8Array, contentType: string, fileName: string) {
  const reply = await call<{
    data: {
      files: {
        file_id: string;
        requests: { url: string; method: string; headers: Record<string, string> }[];
      }[];
    };
  }>("file", {
    method: "POST",
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }],
    }),
  });
  const file = reply.data.files[0];
  const put = file.requests[0];
  const res = await fetch(put.url, {
    method: put.method ?? "PUT",
    headers: put.headers,
    body: Buffer.from(bytes),
  });
  if (!res.ok) throw new YouCamError(`Upload failed with ${res.status}`, 502, "UploadFailed");
  return file.file_id;
}

export async function createTask(kind: TaskKind, body: Record<string, unknown>) {
  const reply = await call<{ data: { task_id: string } }>(TASK_PATH[kind], {
    method: "POST",
    body: JSON.stringify(body),
  });
  return reply.data.task_id;
}

/** Waits for a task to end. YouCam charges only for success, and a task must be polled or it is lost. */
export async function waitForTask(kind: TaskKind, id: string, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const task = await getTask(kind, id);
    if (task.status === "success") return task.data;
    if (task.status === "error") throw new YouCamError(task.error ?? "The task failed", 422, "TaskFailed");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new YouCamError("YouCam took too long. Try again.", 504, "Timeout");
}

export type TaskResult = {
  status: "running" | "success" | "error";
  error?: string;
  data?: Record<string, unknown>;
};

export async function getTask(kind: TaskKind, id: string): Promise<TaskResult> {
  const reply = await call<{ data: Record<string, unknown> }>(
    `${TASK_PATH[kind]}/${encodeURIComponent(id)}`,
  );
  const status = String(reply.data.task_status ?? "running");
  if (status === "success") return { status: "success", data: reply.data };
  if (status === "error") {
    const why = reply.data.error ?? reply.data.error_message ?? reply.data.failure_reason;
    return { status: "error", error: friendlyError(String(why ?? "unknown")) };
  }
  return { status: "running" };
}

/** Turn engine codes into something a shopper can act on. */
export function friendlyError(code: string): string {
  const known: [string, string][] = [
    ["face_too_small", "Move closer, so your face fills most of the frame."],
    ["position_too_small", "Move closer, so your face fills most of the frame."],
    ["out_of_bound", "Centre your face, with all of it in the frame."],
    ["out_of_boundary", "Centre your face, with all of it in the frame."],
    ["lighting_dark", "It is too dark. Face a window or a lamp."],
    ["below_min_image_size", "That photo is too small. Use one at least 480 pixels wide."],
    ["exceed_max_image_size", "That photo is too large. Use one under 10 MB."],
    ["face_angle", "Look straight at the camera."],
    ["nsfw", "That photo could not be used."],
    ["multiple", "Only one person can be in the photo."],
  ];
  return known.find(([k]) => code.includes(k))?.[1] ?? "That photo did not work. Try a clear, front-facing one.";
}

/** Read the first URL out of a task result; the docs show both array and object forms. */
export function resultUrl(data: Record<string, unknown> | undefined): string | undefined {
  const results = data?.results as
    | { url?: string; download_url?: string }
    | { url?: string; download_url?: string }[]
    | undefined;
  const first = Array.isArray(results) ? results[0] : results;
  return first?.download_url ?? first?.url;
}

/** Result links expire quickly, so the server fetches the image and returns it inside the reply. */
export async function resultImage(data: Record<string, unknown> | undefined) {
  const url = resultUrl(data);
  if (!url) throw new YouCamError("YouCam returned no image.", 502, "NoResult");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new YouCamError("The try-on image could not be loaded.", 502, "ResultFailed");
  const type = res.headers.get("content-type") ?? "image/jpeg";
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

export function parseSkin(data: Record<string, unknown> | undefined): SkinScores {
  const output =
    (data?.results as { output?: { type: string; ui_score: number; raw_score: number }[] })?.output ?? [];
  const score = (type: string) => {
    const item = output.find((o) => o.type === type);
    return item ? Math.round(item.ui_score ?? item.raw_score) : 70;
  };
  return {
    oiliness: score("oiliness"),
    moisture: score("moisture"),
    radiance: score("radiance"),
    redness: score("redness"),
    texture: score("texture"),
    pore: score("pore"),
    wrinkle: score("wrinkle"),
    acne: score("acne"),
    dark_circle: score("dark_circle_v2"),
  };
}

const asHex = (colour: string) => (colour?.startsWith("#") ? colour : `#${colour}`);

export function parseTone(data: Record<string, unknown> | undefined): Tone {
  const c = (data?.results as { color?: Record<string, string> })?.color ?? {};
  return { skin: asHex(c.skin_color), lip: asHex(c.lip_color), eye: asHex(c.eye_color), brow: asHex(c.eyebrow_color), hair: asHex(c.hair_color) };
}

export function parseFace(data: Record<string, unknown> | undefined): Shape {
  const r = (data?.results ?? {}) as {
    faceshape?: string;
    eyelid?: { left_shape?: string; left_eyelid?: string };
    eyebrow?: { thickness?: string };
    lipshape?: string[];
    cheekbone?: { overall?: string };
  };
  return {
    faceShape: r.faceshape ?? "Unknown",
    eyeShape: r.eyelid?.left_shape ?? "Unknown",
    eyelid: r.eyelid?.left_eyelid ?? "Unknown",
    eyebrowThickness: r.eyebrow?.thickness ?? "Unknown",
    lipShape: r.lipshape?.join(" ") ?? "Unknown",
    cheekbones: r.cheekbone?.overall ?? "Unknown",
  };
}

const LIP_TYPES = new Set(["lipstick", "lip_liner"]);

/** The YouCam effect for one catalog shade. Hex colours come straight from the catalog. */
export function makeupEffect(type: string, finish: string | null, hex: string) {
  if (type === "lip_gloss") {
    return {
      category: "lip_color",
      shape: { name: "original" },
      palettes: [{ color: hex, texture: "gloss", colorIntensity: 70, gloss: 60, transparencyIntensity: 30 }],
      style: { type: "full" },
    };
  }
  if (LIP_TYPES.has(type)) {
    return {
      category: "lip_color",
      shape: { name: "original" },
      palettes: [{ color: hex, texture: finish === "matte" ? "matte" : "satin", colorIntensity: 75 }],
      style: { type: "full" },
    };
  }
  if (type === "foundation" || type === "concealer") {
    return { category: "foundation", palettes: [{ color: hex, colorIntensity: 60, glowIntensity: finish === "dewy" ? 55 : 30, coverageIntensity: 55 }] };
  }
  if (type === "blush" || type === "bronzer") {
    return { category: "blush", pattern: { name: "1color1" }, palettes: [{ color: hex, texture: "matte", colorIntensity: 55 }] };
  }
  return null;
}
