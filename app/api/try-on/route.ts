import { NextResponse } from "next/server";
import attributes from "@/data/attributes.json";
import catalog from "@/data/catalog.json";
import { SAMPLES } from "@/lib/creators";
import { allow, visitorOf } from "@/lib/rate-limit";
import { refund, reserve } from "@/lib/units";
import { isHex } from "@/lib/validate";
import { createTask, failureOf, hasKey, makeupEffect, resultImage, UNIT_COST, uploadImage, waitForTask, YouCamError } from "@/lib/youcam";

type Body = { steps?: unknown; fileId?: unknown; samplePhoto?: unknown };
type Step = { productId: string; hex: string };

const MAX_STEPS = 8;
const MAX_FILE_ID = 1024;
const RENDERS_PER_MINUTE = 20;
const finishes = attributes as Record<string, { finish: string | null }>;
const samplePhotos = new Set(SAMPLES.map((s) => s.photo));
/** Sample faces are uploaded once. Each upload then serves every later try-on. */
const sampleFiles = new Map<string, string>();

const isStep = (value: unknown): value is Step => {
  const step = value as Partial<Step> | null;
  return typeof step?.productId === "string" && isHex(step.hex);
};

async function sampleFile(path: string, origin: string) {
  const known = sampleFiles.get(path);
  if (known) return known;
  const res = await fetch(new URL(path, origin));
  if (!res.ok) throw new YouCamError("The sample face could not be loaded.", 500);
  const id = await uploadImage(new Uint8Array(await res.arrayBuffer()), "image/jpeg", "sample.jpg");
  sampleFiles.set(path, id);
  return id;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const steps = Array.isArray(body.steps) ? body.steps.slice(0, MAX_STEPS).filter(isStep) : [];
  const effects = steps.flatMap((step) => {
    const product = catalog.products.find((p) => p.id === step.productId);
    if (!product) return [];
    const effect = makeupEffect(product.type, finishes[product.id]?.finish ?? null, step.hex);
    return effect ? [effect] : [];
  });

  if (!effects.length) return NextResponse.json({ error: "Live try-on for this kind of product is coming." }, { status: 422 });
  if (!hasKey()) return NextResponse.json({ error: "Live try-on needs the YouCam key." }, { status: 503 });

  const ownFile = typeof body.fileId === "string" && body.fileId.length <= MAX_FILE_ID ? body.fileId : null;
  const sample = typeof body.samplePhoto === "string" && samplePhotos.has(body.samplePhoto) ? body.samplePhoto : null;
  if (!ownFile && !sample) return NextResponse.json({ error: "Scan your face first." }, { status: 400 });

  if (!allow(`try-on:${visitorOf(request)}`, RENDERS_PER_MINUTE, 60 * 1000)) return NextResponse.json({ error: "Too many try-ons. Wait a moment." }, { status: 429 });
  if (!reserve(UNIT_COST.makeup)) return NextResponse.json({ error: "Live try-on is paused for today." }, { status: 429 });

  try {
    const fileId = ownFile ?? (await sampleFile(sample!, request.url));
    const id = await createTask("makeup", { src_file_id: fileId, effects, version: "1.0" });
    const data = await waitForTask("makeup", id);
    return NextResponse.json({ url: await resultImage(data) });
  } catch (error) {
    refund(UNIT_COST.makeup);
    const { message, status } = failureOf(error, "That did not work. Try again.");
    return NextResponse.json({ error: message }, { status });
  }
}
