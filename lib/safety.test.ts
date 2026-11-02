// Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLES } from "./creators";
import { allow } from "./rate-limit";
import { refund, reserve, unitsLeft } from "./units";
import { isFace, isHex, isSignals } from "./validate";

const face = SAMPLES[0].face;

test("every sample face passes the input check", () => {
  for (const sample of SAMPLES) assert.ok(isFace(sample.face), sample.id);
});

test("a face with a broken colour or a missing part is refused", () => {
  assert.equal(isFace({ ...face, tone: { ...face.tone, skin: "red" } }), false);
  assert.equal(isFace({ ...face, skin: { ...face.skin, moisture: "high" } }), false);
  assert.equal(isFace({ ...face, shape: undefined }), false);
  assert.equal(isFace(null), false);
});

test("a very long shape label is refused", () => {
  assert.equal(isFace({ ...face, shape: { ...face.shape, lipShape: "x".repeat(500) } }), false);
});

test("only six-digit hex colours are accepted", () => {
  assert.ok(isHex("#A1b2C3"));
  assert.equal(isHex("#abc"), false);
  assert.equal(isHex("url(evil)"), false);
});

test("signals outside 0 to 1 cannot reach the model", () => {
  const signals = { optical: 0.5, physical: 0.5, creator: 0.5, graph: 0.5, popularity: 0.3 };
  assert.ok(isSignals(signals));
  assert.equal(isSignals({ ...signals, optical: 900 }), false);
  assert.equal(isSignals({ ...signals, graph: Number.NaN }), false);
  assert.equal(isSignals({ optical: 0.5 }), false);
});

test("the rate limit blocks a burst and recovers after the window", () => {
  assert.ok(allow("burst", 2, 1000, 0));
  assert.ok(allow("burst", 2, 1000, 10));
  assert.equal(allow("burst", 2, 1000, 20), false);
  assert.ok(allow("burst", 2, 1000, 1500));
});

test("visitors are limited separately", () => {
  assert.ok(allow("first", 1, 1000, 0));
  assert.equal(allow("first", 1, 1000, 1), false);
  assert.ok(allow("second", 1, 1000, 1));
});

test("units are reserved up front and returned after a failure", () => {
  const start = unitsLeft();
  assert.ok(reserve(10));
  assert.equal(unitsLeft(), start - 10);
  refund(10);
  assert.equal(unitsLeft(), start);
  assert.equal(reserve(start + 1), false);
  assert.equal(unitsLeft(), start);
});
