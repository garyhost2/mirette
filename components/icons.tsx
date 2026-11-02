import type { Direction } from "@/lib/capture";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The Mirette mark: a woman's eye with a winged lid and lashes. */
export function EyeMark() {
  return (
    <svg width="30" height="15" viewBox="0 0 60 30" aria-hidden="true">
      <path d="M1 21C12 7 24 2 36 3c8 .7 15 4 23-1-5 8-12 10-17 11C33 7 18 9 7 21c-2 1.200-4 1.200-6 0Z" fill="currentColor" />
      <path d="M7 21c8 6 16 8 24 8 8 0 14-3 20-9" fill="none" stroke="currentColor" strokeWidth="1.200" strokeLinecap="round" />
      <circle cx="29" cy="16" r="6.500" fill="currentColor" />
    </svg>
  );
}

export const PersonIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...base} strokeWidth={1.2}>
    <circle cx="12" cy="8.500" r="4" />
    <path d="M4.500 21c.7-4.500 3.600-7 7.500-7s6.800 2.500 7.500 7" />
  </svg>
);

const TURN = { right: 0, down: 90, left: 180, up: 270 };

/** The guided selfie's arrow: one line for a direction, or two for moving closer or further away. */
export function DirectionIcon({ direction }: { direction: Direction }) {
  if (direction === "closer" || direction === "further") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...base} strokeWidth={1.6}>
        <path d={direction === "closer" ? "M9 9 3.500 3.500M3.500 8.500v-5h5M15 15l5.500 5.500M20.500 15.500v5h-5" : "M3.500 3.500 9 9M9 4v5H4M20.500 20.500 15 15M15 20v-5h5"} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...base} strokeWidth={1.6} style={{ transform: `rotate(${TURN[direction]}deg)` }}>
      <path d="M3 12h18M14 5l7 7-7 7" />
    </svg>
  );
}

export const DiscoverIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <circle cx="12" cy="12" r="8.500" />
    <path d="m15.500 8.500-2 5-5 2 2-5 5-2Z" />
  </svg>
);

export const TryOnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M8 14.500h8V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5.500Z" />
    <path d="M9.500 14.500V11h5v3.500" />
    <path d="M10.500 11V6.500l3-3V11" />
  </svg>
);

export const HeartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M12 20.500S3.500 15.700 3.500 9.500A4.700 4.700 0 0 1 12 6.800a4.700 4.700 0 0 1 8.500 2.700c0 6.200-8.500 11-8.500 11Z" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);

export const OutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
