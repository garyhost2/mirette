import { NextResponse } from "next/server";
import { SAMPLES } from "@/lib/creators";
import type { Face } from "@/lib/face";
import { allow, visitorOf } from "@/lib/rate-limit";
import { refund, reserve } from "@/lib/units";
import { isFace } from "@/lib/validate";
import { createTask, FACE_FEATURES, failureOf, friendlyError, hasKey, parseFace, parseSkin, parseTone, SKIN_ACTIONS, UNIT_COST, uploadImage, waitForTask, YouCamError } from "@/lib/youcam";

const FULL_SCAN = UNIT_COST.tone + UNIT_COST.skin + UNIT_COST.face;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const SCANS_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000;

/** A selfie goes to YouCam for three readings. Only the results come back to the shopper's device. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "That photo did not arrive. Try again." }, { status: 400 });
  const photo = form.get("photo");

  if (!(photo instanceof File)) {
    const sample = SAMPLES.find((s) => s.id === form.get("sample")) ?? SAMPLES[0];
    return NextResponse.json({ face: sample.face });
  }
  if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: friendlyError("exceed_max_image_size") }, { status: 413 });
  if (photo.type && !PHOTO_TYPES.has(photo.type)) return NextResponse.json({ error: "Use a JPG or PNG photo." }, { status: 415 });
  if (!hasKey()) return NextResponse.json({ error: "Live scans start once the YouCam key is connected." }, { status: 503 });
  if (!allow(`scan:${visitorOf(request)}`, SCANS_PER_WINDOW, WINDOW_MS)) return NextResponse.json({ error: "Too many scans. Try again in a few minutes." }, { status: 429 });
  if (!reserve(FULL_SCAN)) return NextResponse.json({ error: "Live scans are paused for today. Try the sample face." }, { status: 429 });

  try {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const fileId = await uploadImage(bytes, photo.type || "image/jpeg", photo.name || "selfie.jpg");
    const [tone, skin, shape] = await Promise.all([
      createTask("tone", { src_file_id: fileId, face_angle_strictness_level: "medium" }).then((id) => waitForTask("tone", id)),
      createTask("skin", { src_file_id: fileId, dst_actions: SKIN_ACTIONS, format: "json" }).then((id) => waitForTask("skin", id)),
      createTask("face", { src_file_id: fileId, features: FACE_FEATURES }).then((id) => waitForTask("face", id)),
    ]);
    const face: Face = { tone: parseTone(tone), skin: parseSkin(skin), shape: parseFace(shape), source: "live" };
    if (!isFace(face)) throw new YouCamError(friendlyError("unknown"), 502, "BadResult");
    return NextResponse.json({ face, fileId });
  } catch (error) {
    refund(FULL_SCAN);
    const { message, status } = failureOf(error, friendlyError("unknown"));
    return NextResponse.json({ error: message }, { status });
  }
}
