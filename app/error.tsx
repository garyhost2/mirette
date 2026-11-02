"use client";

import { useEffect } from "react";
import { WaterScene } from "@/components/Water";

export default function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="me-page">
      <WaterScene photo={null} />
      <h1>Something went wrong</h1>
      <p>The water is settling. Try again in a moment.</p>
      <div className="actions">
        <button className="btn" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
