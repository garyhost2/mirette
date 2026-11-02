// Serves MediaPipe's browser engine from this site, so the on-device preview needs no other host.
// Runs before dev and build. The files come from node_modules, so they stay out of the repo.

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const from = new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url);
const to = new URL("../public/mediapipe/wasm/", import.meta.url);

mkdirSync(to, { recursive: true });
for (const name of readdirSync(from)) {
  if (name.includes("module")) continue;
  if (!existsSync(new URL(name, to))) cpSync(new URL(name, from), new URL(name, to));
}
