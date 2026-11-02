// Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { arrowFor, coach, readPose, type Pose } from "./capture";
import { CREATORS, faceOfCreator, LOOKS, SAMPLE_FACE } from "./creators";
import { stories } from "./feed";
import { judgeShade } from "./guide";
import { deltaE, depthOf, hexToLab, ita, labToHex } from "./color";
import { fit, type EngineProduct } from "./engine";
import { traitTags, traitsOf, type Face } from "./face";
import { kindOfLook, matchLook } from "./match";
import { predict, RULES_ONLY, sample, update, type Model, type Signals } from "./learn";
import { onFaceColour, onFaceLab, suit, type Attributes } from "./suit";
import { translate } from "./translate";

const plain: Attributes = { finish: null, coverage: null, formula: null, claims: [], opacity: 0.6 };
const product = (type: string, attributes: Partial<Attributes>, hexes: string[]): EngineProduct => ({
  id: "p",
  type,
  shades: hexes.map((hex, i) => ({ name: `s${i}`, hex })),
  offers: [{}],
  attributes: { ...plain, ...attributes },
});
const fresh = (): Model => ({ ...RULES_ONLY, weights: [...RULES_ONLY.weights], pairs: {}, seen: {} });
const signals: Signals = { optical: 0.5, physical: 0.5, creator: 0.5, graph: 0.5, popularity: 0.3 };

test("foundation picks the shade closest to the skin", () => {
  const skin = SAMPLE_FACE.tone.skin;
  const result = fit(SAMPLE_FACE, product("foundation", {}, ["#f4e2d0", skin, "#4a2c1c"]), RULES_ONLY);
  assert.equal(result?.hex, skin);
});

test("a sheer product forgives a shade that a full cover would not", () => {
  const off = "#e8c8a6";
  const sheer = suit(SAMPLE_FACE, { type: "foundation", attributes: { ...plain, opacity: 0.25 } }, off);
  const full = suit(SAMPLE_FACE, { type: "foundation", attributes: { ...plain, opacity: 0.9 } }, off);
  assert.ok(sheer.optical > full.optical);
});

test("the colour on the face sits between the lip and the product", () => {
  const onFace = onFaceColour("#c08070", "#800020", 0.5);
  assert.ok(deltaE(onFace, "#c08070") < deltaE("#800020", "#c08070"));
});

test("oily skin prefers matte over dewy", () => {
  const oily: Face = { ...SAMPLE_FACE, skin: { ...SAMPLE_FACE.skin, oiliness: 30, moisture: 80 } };
  const matte = suit(oily, { type: "foundation", attributes: { ...plain, finish: "matte" } }, oily.tone.skin);
  const dewy = suit(oily, { type: "foundation", attributes: { ...plain, finish: "dewy" } }, oily.tone.skin);
  assert.ok(matte.physical > dewy.physical);
  assert.ok(matte.reasons.some((r) => r.includes("oily")));
});

test("hooded lids prefer waterproof liner", () => {
  const hooded: Face = { ...SAMPLE_FACE, shape: { ...SAMPLE_FACE.shape, eyelid: "Hooded-lid" } };
  const waterproof = suit(hooded, { type: "eyeliner", attributes: { ...plain, claims: ["waterproof"] } }, "#111111");
  const plainLiner = suit(hooded, { type: "eyeliner", attributes: plain }, "#111111");
  assert.ok(waterproof.physical > plainLiner.physical);
});

test("the same face matches itself best, and reasons name the shared trait", () => {
  const other: Face = { ...SAMPLE_FACE, tone: { ...SAMPLE_FACE.tone, skin: "#5a3424", lip: "#6a2a2a" }, shape: { ...SAMPLE_FACE.shape, lipShape: "Thin" } };
  const self = matchLook(SAMPLE_FACE, SAMPLE_FACE, "lip");
  assert.equal(self.score, 100);
  assert.ok(matchLook(SAMPLE_FACE, other, "lip").score < self.score);
  assert.ok(self.reasons[0].startsWith("Same"));
});

test("looks are classified by their products", () => {
  assert.equal(kindOfLook(["eyeshadow", "eyeliner", "concealer"]), "eye");
  assert.equal(kindOfLook(["foundation", "lipstick", "mascara"]), "lip");
  assert.equal(kindOfLook(["concealer", "blush", "brow"]), "face");
});

test("behaviour moves a trait and attribute pair", () => {
  const model = fresh();
  const before = predict(model, signals, ["oily"], ["finish:matte"]);
  for (let i = 0; i < 200; i++) update(model, signals, ["oily"], ["finish:matte"], "click");
  assert.ok(predict(model, signals, ["oily"], ["finish:matte"]) > before + 0.2);
  assert.ok((model.pairs["oily|finish:matte"] ?? 0) > 0);
});

test("skips lower a score", () => {
  const model = fresh();
  const before = predict(model, signals, ["dry"], ["finish:matte"]);
  for (let i = 0; i < 200; i++) update(model, signals, ["dry"], ["finish:matte"], "skip");
  assert.ok(predict(model, signals, ["dry"], ["finish:matte"]) < before);
});

test("exploration spreads less as evidence grows", () => {
  const spread = (model: Model) => {
    const draws = Array.from({ length: 400 }, () => sample(model, signals, ["oily"], ["finish:matte"]));
    return Math.max(...draws) - Math.min(...draws);
  };
  const known = fresh();
  known.seen["oily|finish:matte"] = 5000;
  assert.ok(spread(fresh()) > spread(known));
});

test("traits read a hooded, oily face", () => {
  const face: Face = { ...SAMPLE_FACE, skin: { ...SAMPLE_FACE.skin, oiliness: 30 }, shape: { ...SAMPLE_FACE.shape, eyelid: "Hooded-lid" } };
  const tags = traitTags(traitsOf(face));
  assert.ok(tags.includes("oily") && tags.includes("hooded"));
});

test("on deep skin a pale grey colour warns, and a bright light colour glows", () => {
  const deep = faceOfCreator(CREATORS.find((c) => c.id === "amara")!);
  const pale = judgeShade(deep, traitsOf(deep), "blush", "#d8cfc8");
  const bright = judgeShade(deep, traitsOf(deep), "blush", "#ff9a7a");
  const rich = judgeShade(deep, traitsOf(deep), "lipstick", "#a81e3c");
  const paleLip = judgeShade(deep, traitsOf(deep), "lipstick", "#ffb08a");
  assert.ok(rich.change > paleLip.change);
  assert.ok(pale.change < 0);
  assert.ok(pale.warnings.some((w) => w.includes("ashy")));
  assert.ok(bright.change > 0);
});

test("the same bronzer warns on fair skin but not on deep skin", () => {
  const fair = faceOfCreator(CREATORS.find((c) => c.id === "lucie")!);
  const deep = faceOfCreator(CREATORS.find((c) => c.id === "amara")!);
  assert.ok(judgeShade(fair, traitsOf(fair), "bronzer", "#6b3f28").warnings.length > 0);
  assert.equal(judgeShade(deep, traitsOf(deep), "bronzer", "#6b3f28").warnings.length, 0);
});

test("the guide changes which shade wins", () => {
  const deep = faceOfCreator(CREATORS.find((c) => c.id === "amara")!);
  const best = fit(deep, product("highlighter", {}, ["#f4f1f6", "#d8a860"]), RULES_ONLY);
  assert.equal(best?.hex, "#d8a860");
});

test("ITA places skin tones in order", () => {
  assert.ok(ita("#f0d9c6") > ita("#c49a78"));
  assert.ok(ita("#c49a78") > ita("#7a4c34"));
  assert.equal(depthOf("#7a4c34"), "deep");
  assert.equal(depthOf("#f0d9c6"), "fair");
});

test("Lab conversion goes both ways", () => {
  assert.ok(deltaE(labToHex(hexToLab("#a8524c")), "#a8524c") < 0.5);
});

test("coverage is a smooth curve between skin and product", () => {
  const none = onFaceLab("#7a4c34", "#e8c8a6", 0);
  const half = onFaceLab("#7a4c34", "#e8c8a6", 0.5);
  const full = onFaceLab("#7a4c34", "#e8c8a6", 1);
  assert.ok(Math.abs(none.L - hexToLab("#7a4c34").L) < 0.01);
  assert.ok(Math.abs(full.L - hexToLab("#e8c8a6").L) < 0.01);
  assert.ok(none.L < half.L && half.L < full.L);
});

test("a look translates to a deeper shade for deeper skin", () => {
  const fair = faceOfCreator(CREATORS.find((c) => c.id === "lucie")!);
  const deep = faceOfCreator(CREATORS.find((c) => c.id === "amara")!);
  const shades = ["#f0a090", "#c8505a", "#8a2a34", "#4a141c"].map((hex) => ({ productId: hex, shade: hex, hex, opacity: 0.8 }));
  const onFair = translate(fair, fair, "lipstick", "#c8505a", 0.8, shades);
  const onDeep = translate(fair, deep, "lipstick", "#c8505a", 0.8, shades);
  assert.equal(onFair?.hex, "#c8505a");
  assert.ok(hexToLab(onDeep!.hex).L < hexToLab(onFair!.hex).L);
});

const facePoints = (shift: number, size = 0.5) => {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.46 }));
  points[234] = { x: 0.3, y: 0.45 };
  points[454] = { x: 0.7, y: 0.45 };
  points[1] = { x: 0.5 + shift, y: 0.5 };
  points[33] = { x: 0.4, y: 0.36 };
  points[263] = { x: 0.6, y: 0.36 };
  points[10] = { x: 0.5, y: 0.46 - size / 2 };
  points[152] = { x: 0.5, y: 0.46 + size / 2 };
  return points;
};

test("the guide reads which way a face is turned", () => {
  assert.ok(readPose(facePoints(0.08)).yaw > 0);
  assert.ok(readPose(facePoints(-0.08)).yaw < 0);
  assert.ok(Math.abs(readPose(facePoints(0)).yaw) < 0.01);
});

test("each step waits for the right position", () => {
  const front = readPose(facePoints(0));
  assert.equal(coach("front", front, 120), null);
  assert.equal(coach("left", readPose(facePoints(0.08)), 120), null);
  assert.equal(coach("right", readPose(facePoints(-0.08)), 120), null);
  assert.equal(coach("left", front, 120), "A little further left");
  assert.equal(coach("right", readPose(facePoints(0.08)), 120), "A little further right");
});

test("the guide coaches light and distance before anything else", () => {
  const front = readPose(facePoints(0));
  assert.match(coach("front", front, 20)!, /dark/);
  assert.match(coach("front", front, 250)!, /bright/);
  assert.match(coach("front", readPose(facePoints(0, 0.2)), 120)!, /closer/);
  assert.match(coach("front", null, 120)!, /oval/);
});

const level: Pose = { yaw: 0, tilt: 0, size: 0.5, offset: 0, shiftX: 0, shiftY: 0 };

test("the arrow points where the shopper should turn", () => {
  assert.equal(arrowFor("front", level), null);
  assert.equal(arrowFor("left", level), "left");
  assert.equal(arrowFor("right", level), "right");
  assert.equal(arrowFor("left", { ...level, yaw: 0.2 }), null);
  assert.equal(arrowFor("front", { ...level, yaw: 0.2 }), "right");
});

test("the arrow brings a face back to the middle of the mirrored view", () => {
  assert.equal(arrowFor("front", { ...level, offset: 0.3, shiftX: 0.3 }), "right");
  assert.equal(arrowFor("front", { ...level, offset: 0.3, shiftX: -0.3 }), "left");
  assert.equal(arrowFor("front", { ...level, offset: 0.3, shiftY: 0.3 }), "up");
  assert.equal(arrowFor("front", { ...level, offset: 0.3, shiftY: -0.3 }), "down");
});

test("distance comes first, and no face means no arrow", () => {
  assert.equal(arrowFor("left", { ...level, size: 0.2 }), "closer");
  assert.equal(arrowFor("left", { ...level, size: 0.95 }), "further");
  assert.equal(arrowFor("left", null), null);
});

test("every creator story has a scan, scores and products to tap", () => {
  const list = stories();
  assert.equal(list.length, LOOKS.length);
  for (const story of list) {
    assert.equal(story.scan.length, 6);
    assert.ok(story.scores.every((score) => score.value > 0 && score.value <= 100));
    assert.ok(story.products.length > 0, story.id);
  }
});
