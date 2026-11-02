"use client";

import { useEffect, useRef, useState } from "react";
import { basin } from "@/lib/basin";
import { arrowFor, coach, readPose, STEPS, type Direction, type Point } from "@/lib/capture";
import { detectInVideo } from "@/lib/preview";
import { CloseIcon, DirectionIcon } from "./icons";

const HOLD_MS = 750;
const LOOK_EVERY_MS = 110;
/** If a step cannot be reached, the shopper gets a way to go on instead of being stuck. */
const STUCK_MS = 9000;

function frameBrightness(video: HTMLVideoElement, probe: CanvasRenderingContext2D) {
  probe.drawImage(video, 0, 0, 24, 24);
  const { data } = probe.getImageData(0, 0, 24, 24);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4);
}

function grabFrame(video: HTMLVideoElement, name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise<File | null>((resolve) => canvas.toBlob((blob) => resolve(blob && new File([blob], name, { type: "image/jpeg" })), "image/jpeg", 0.92));
}

/** Draws MediaPipe's face landmarks over the video, matching its cover crop, so the tracking is visible. */
function drawMesh(canvas: HTMLCanvasElement, video: HTMLVideoElement, points: Point[] | null) {
  const { clientWidth: width, clientHeight: height } = canvas;
  const density = Math.min(2, window.devicePixelRatio);
  if (canvas.width !== Math.round(width * density)) {
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
  }
  const context = canvas.getContext("2d")!;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!points) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const left = (width - video.videoWidth * scale) / 2;
  const top = (height - video.videoHeight * scale) / 2;
  context.fillStyle = "rgba(207, 168, 79, 0.95)";
  for (let i = 0; i < points.length; i += 2) {
    context.fillRect(left + points[i].x * video.videoWidth * scale - 1.1, top + points[i].y * video.videoHeight * scale - 1.1, 2.2, 2.2);
  }
}

/** Takes one photo from the front and one from each side, each by itself once the face is in position. */
export function GuidedSelfie({ onDone, onUpload, onClose }: { onDone: (frames: File[]) => void; onUpload: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const mesh = useRef<HTMLCanvasElement>(null);
  const takeNow = useRef<() => void>(() => {});
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState("Starting the camera");
  const [arrow, setArrow] = useState<Direction | null>(null);
  const [hold, setHold] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let index = 0;
    let lastLook = 0;
    let heldSince = 0;
    let stepSince = 0;
    let taking = false;
    const frames: File[] = [];
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = probeCanvas.height = 24;
    const probe = probeCanvas.getContext("2d", { willReadFrequently: true })!;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const take = async () => {
      const el = video.current;
      if (!el || taking) return;
      taking = true;
      const shot = await grabFrame(el, `${STEPS[index].id}.jpg`);
      taking = false;
      if (shot) frames.push(shot);
      navigator.vibrate?.(30);
      basin.ring();
      index++;
      heldSince = 0;
      stepSince = performance.now();
      setHold(0);
      setStuck(false);
      if (index >= STEPS.length) {
        stop();
        onDone(frames);
      } else {
        setStep(index);
      }
    };
    takeNow.current = () => void take();

    const look = async (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(look);
      const el = video.current;
      if (!el || el.readyState < 2 || taking || now - lastLook < LOOK_EVERY_MS) return;
      lastLook = now;
      const points = await detectInVideo(el, now);
      if (stopped || taking) return;
      if (mesh.current) drawMesh(mesh.current, el, points);
      const pose = points ? readPose(points) : null;
      const advice = coach(STEPS[index].id, pose, frameBrightness(el, probe));
      setHint(advice ?? "Hold still");
      setArrow(advice ? arrowFor(STEPS[index].id, pose) : null);
      if (now - stepSince > STUCK_MS) setStuck(true);
      if (advice) {
        heldSince = 0;
        setHold(0);
        return;
      }
      heldSince ||= now;
      setHold(Math.min(1, (now - heldSince) / HOLD_MS));
      if (now - heldSince >= HOLD_MS) void take();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } } });
        if (stopped || !video.current) return stop();
        video.current.srcObject = stream;
        await video.current.play();
        setHint("Loading the face tracker");
        await detectInVideo(video.current, performance.now());
        stepSince = performance.now();
        frame = requestAnimationFrame(look);
      } catch {
        if (!stopped) setFailed(true);
      }
    })();

    return stop;
  }, [onDone]);

  const current = STEPS[step];
  return (
    <section className="guide" aria-label="Guided selfie">
      <video ref={video} playsInline muted />
      <canvas ref={mesh} className="guide-mesh" aria-hidden="true" />
      <div className="guide-oval" aria-hidden="true">
        <svg viewBox="0 0 300 400">
          <ellipse cx="150" cy="200" rx="147" ry="197" className="track" />
          <ellipse cx="150" cy="200" rx="147" ry="197" className="held" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - hold} />
        </svg>
        {arrow && !failed && (
          <span className="guide-arrow" data-direction={arrow}>
            <DirectionIcon direction={arrow} />
          </span>
        )}
      </div>
      <button className="close" onClick={onClose} aria-label="Close the camera">
        <CloseIcon />
      </button>
      <div className="guide-panel" aria-live="polite">
        {failed ? (
          <>
            <h1>The camera could not start</h1>
            <p className="meta">Allow the camera in your browser, or choose a photo instead.</p>
          </>
        ) : (
          <>
            <div className="guide-steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((s, i) => (
                <i key={s.id} data-state={i < step ? "done" : i === step ? "now" : undefined} />
              ))}
            </div>
            <h1>{current.title}</h1>
            <p className="meta">{hint}</p>
          </>
        )}
        <div className="actions">
          {stuck && !failed && (
            <button className="btn" onClick={() => takeNow.current()}>
              Take it anyway
            </button>
          )}
          <button className="link" onClick={onUpload}>
            Choose a photo instead
          </button>
        </div>
      </div>
    </section>
  );
}
