// The guided selfie's rules: what each step asks for, and what to tell the shopper until it is right.
// Works on normalised face landmarks, where x runs left to right across the raw camera image.

export type Point = { x: number; y: number };
export type StepId = "front" | "left" | "right";

export const STEPS: { id: StepId; title: string }[] = [
  { id: "front", title: "Look straight ahead" },
  { id: "left", title: "Turn slowly to your left" },
  { id: "right", title: "Turn slowly to your right" },
];

const NOSE = 1;
const CHEEK_A = 234;
const CHEEK_B = 454;
const EYE_A = 33;
const EYE_B = 263;
const FOREHEAD = 10;
const CHIN = 152;

const TURNED = 0.12;
const LEVEL_NOSE = 0.42;
const MAX_TILT = 0.16;
const MIN_FACE = 0.34;
const MAX_FACE = 0.9;
const MIN_LIGHT = 55;
const MAX_LIGHT = 235;

export type Pose = { yaw: number; tilt: number; size: number; offset: number };

/** Yaw is positive when the shopper turns to their own left, which moves the nose right in the raw image. */
export function readPose(points: Point[]): Pose {
  const a = points[CHEEK_A];
  const b = points[CHEEK_B];
  const eyeY = (points[EYE_A].y + points[EYE_B].y) / 2;
  const middle = (a.x + b.x) / 2;
  const width = Math.max(0.001, Math.abs(b.x - a.x));
  const height = Math.max(0.001, points[CHIN].y - points[FOREHEAD].y);
  return {
    yaw: (points[NOSE].x - middle) / width,
    tilt: (points[NOSE].y - eyeY) / Math.max(0.001, points[CHIN].y - eyeY) - LEVEL_NOSE,
    size: height,
    offset: Math.hypot(middle - 0.5, (points[FOREHEAD].y + points[CHIN].y) / 2 - 0.46),
  };
}

/** What to say next. Null means the shopper is in position and the photo can be taken. */
export function coach(step: StepId, pose: Pose | null, light: number) {
  if (!pose) return "Bring your face into the oval";
  if (light < MIN_LIGHT) return "Too dark. Face a window or a lamp";
  if (light > MAX_LIGHT) return "Too bright. Move out of direct light";
  if (pose.size < MIN_FACE) return "Move a little closer";
  if (pose.size > MAX_FACE) return "Move a little further away";
  if (pose.offset > 0.2) return "Centre your face in the oval";
  if (Math.abs(pose.tilt) > MAX_TILT) return "Keep your chin level";
  if (step === "front" && Math.abs(pose.yaw) > TURNED * 0.7) return "Look straight at the camera";
  if (step === "left" && pose.yaw < TURNED) return "A little further left";
  if (step === "right" && pose.yaw > -TURNED) return "A little further right";
  return null;
}
