"use client";

import { useEffect, useRef } from "react";
import { basin } from "@/lib/basin";

/** The one canvas of the app. It stays mounted across screens so the water never resets. */
export function Water() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!basin.mount(ref.current!)) document.documentElement.dataset.water = "off";
    // Touch moves keep arriving during a scroll, so the finger marks the water while the page moves.
    const onTouch = (e: TouchEvent) => basin.touch(e.touches[0].clientX, e.touches[0].clientY);
    const onMouse = (e: PointerEvent) => {
      if (e.pointerType === "mouse") basin.touch(e.clientX, e.clientY, 0.03, 0.04);
    };
    const onTap = (e: PointerEvent) => basin.touch(e.clientX, e.clientY, 0.22, 0.07);
    addEventListener("touchmove", onTouch, { passive: true });
    addEventListener("pointermove", onMouse, { passive: true });
    addEventListener("pointerdown", onTap, { passive: true });
    return () => {
      basin.unmount();
      removeEventListener("touchmove", onTouch);
      removeEventListener("pointermove", onMouse);
      removeEventListener("pointerdown", onTap);
    };
  }, []);

  return <canvas ref={ref} className="water" aria-hidden="true" />;
}

/** Puts one photo, or none, above the water for a screen with no feed of its own. */
export function WaterScene({ photo, dim }: { photo: string | null; dim?: number }) {
  useEffect(() => {
    basin.open(photo, dim);
  }, [photo, dim]);
  return null;
}
