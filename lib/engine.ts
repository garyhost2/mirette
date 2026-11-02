// Scores one product for one face. Shared by the app and by the simulation, so the shoppers the
// model trains on go through exactly the same code as real ones.

import { attributeTags, localGraphScore } from "./graph";
import { predict, sample, type Model, type Signals } from "./learn";
import { suit, type Attributes } from "./suit";
import { traitTags, traitsOf, type Face } from "./face";

export type EngineShade = { name: string; hex: string | null };
export type EngineProduct = {
  id: string;
  type: string;
  shades: EngineShade[];
  offers: unknown[];
  attributes: Attributes;
};

export type Fit = {
  productId: string;
  shade: string | null;
  hex: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
  signals: Signals;
};

/** More shades and more sellers mean a product is easier to buy, not that it suits anyone. */
export const popularityOf = (p: EngineProduct) => Math.min(1, p.shades.length / 40) * 0.6 + Math.min(1, p.offers.length / 3) * 0.4;

export function fit(
  face: Face,
  product: EngineProduct,
  model: Model,
  options: { creator?: number; graph?: number; explore?: () => number } = {},
): Fit | null {
  const coloured = product.shades.filter((s): s is EngineShade & { hex: string } => !!s.hex);
  if (!coloured.length) return null;

  const traits = traitTags(traitsOf(face));
  const tags = attributeTags(product.attributes);
  const graph = options.graph ?? localGraphScore(traits, tags);
  const creator = options.creator ?? 0.5;
  const popularity = popularityOf(product);

  const candidates = coloured.map((shade) => {
    const result = suit(face, { type: product.type, attributes: product.attributes }, shade.hex);
    return { shade, result };
  });
  const best = candidates.reduce((a, b) => (b.result.optical > a.result.optical ? b : a));
  const signals: Signals = { optical: best.result.optical, physical: best.result.physical, creator, graph, popularity };
  const score = options.explore ? sample(model, signals, traits, tags, options.explore) : predict(model, signals, traits, tags);

  return { productId: product.id, shade: best.shade.name, hex: best.shade.hex, score, reasons: best.result.reasons, warnings: best.result.warnings, signals };
}

export { traitTags, traitsOf };
