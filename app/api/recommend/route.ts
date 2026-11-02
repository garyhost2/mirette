import { NextResponse } from "next/server";
import { allow, visitorOf } from "@/lib/rate-limit";
import { bestFamilies, fitsFor, recommend, shadesWithinReach, shopperGraph, translateLooks } from "@/lib/recommend";
import { isFace } from "@/lib/validate";

const READINGS_PER_MINUTE = 30;

/** The face is sent with each request and kept on the shopper's device, not on the server. */
export async function POST(request: Request) {
  const { face } = (await request.json().catch(() => ({}))) as { face?: unknown };
  if (!isFace(face)) return NextResponse.json({ error: "Scan your face first." }, { status: 400 });
  if (!allow(`recommend:${visitorOf(request)}`, READINGS_PER_MINUTE, 60 * 1000)) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });

  const fits = fitsFor(face);
  return NextResponse.json({
    ...(await recommend(face)),
    fits,
    families: bestFamilies(fits),
    graphView: shopperGraph(face),
    translations: translateLooks(face),
    reach: shadesWithinReach(face),
  });
}
