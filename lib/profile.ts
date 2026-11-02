"use client";

// The shopper's scan stays on their own device. Only the readings are kept, never the photo.

import { useSyncExternalStore } from "react";
import type { Face } from "./face";
import type { EventKind } from "./learn";

export type Reading = {
  graph: string;
  model: { simulated: number; real: number };
  traits: string[];
  creators: { creatorId: string; name: string; look: string; score: number; reasons: string[] }[];
  needs: { id: string; title: string; advice: string }[];
  fits: Record<string, { percent: number; shade: string | null; hex: string | null; reason: string | null; warning: string | null }>;
  families: { id: string; name: string; percent: number; products: number }[];
  translations: Record<string, { productId: string; type: string; title: string; image: string; shade: string | null; hex: string; url: string }[]>;
  reach: { near: number; total: number };
  graphView: { source: string; edges: { trait: string; attribute: string; weight: number; products: number }[] };
};

export type Profile = { face: Face; reading: Reading | null; fileId?: string };
export type SavedItem = { id: string; title: string; brand: string; image: string; priceFrom: number };

const KEY = "mirette.face";
const SAVED_KEY = "mirette.saved";
const listeners = new Set<() => void>();
let current: Profile | null = null;
const NOTHING_SAVED: SavedItem[] = [];
let saved: SavedItem[] = NOTHING_SAVED;
let started = false;

function emit() {
  for (const listen of listeners) listen();
}

async function read(face: Face) {
  const res = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ face }) });
  if (!res.ok) return null;
  return (await res.json()) as Reading;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const items = localStorage.getItem(SAVED_KEY);
    if (items) saved = JSON.parse(items);
    const face = localStorage.getItem(KEY);
    if (face) void setFace(JSON.parse(face));
  } catch {
    // Private windows can block storage. The scan then lasts for this visit only.
  }
}

export async function setFace(face: Face, fileId?: string) {
  current = { face, reading: null, fileId };
  emit();
  try {
    localStorage.setItem(KEY, JSON.stringify(face));
  } catch {
    // See start().
  }
  const reading = await read(face);
  if (current?.face === face) {
    current = { ...current, reading };
    emit();
  }
}

export function clearFace() {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // See start().
  }
  emit();
}

export function useProfile() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      start();
      return () => listeners.delete(listen);
    },
    () => current,
    () => null,
  );
}

export function useSaved() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      start();
      return () => listeners.delete(listen);
    },
    () => saved,
    () => NOTHING_SAVED,
  );
}

export function toggleSaved(item: SavedItem) {
  const had = saved.some((s) => s.id === item.id);
  saved = had ? saved.filter((s) => s.id !== item.id) : [item, ...saved];
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // See start().
  }
  emit();
  if (!had) track("save", item.id);
}

/** Tells the engine what a scanned shopper did. Shoppers with no scan leave no trace. */
export function track(kind: EventKind, productId: string) {
  if (!current) return;
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, productId, face: current.face }),
    keepalive: true,
  }).catch(() => {});
}
