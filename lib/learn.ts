// The behaviour model. For a shopper and a shade:
//   score = sigmoid(w0 + w1·optical + w2·physical + w3·creator + w4·graph + w5·popularity + Σ pair weights)
// Pair weights link one face trait to one product attribute, such as "oily × matte".
// They start at zero and move with behaviour, which is how real shoppers correct the rules in suit.ts.

export type Signals = { optical: number; physical: number; creator: number; graph: number; popularity: number };

export type Model = {
  weights: number[];
  /** "trait|attribute" → learned weight. */
  pairs: Record<string, number>;
  /** How many events have informed each pair, which sets how unsure the model still is. */
  seen: Record<string, number>;
  events: number;
  source: "rules" | "simulated" | "real";
};

export const RULES_ONLY: Model = { weights: [-2.4, 2.4, 1.2, 0.6, 0.4, 0.2], pairs: {}, seen: {}, events: 0, source: "rules" };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Strength of each behaviour. A click out to a seller is the clearest yes we can see. */
export const EVENT_VALUE = { click: 1, save: 1, tryon: 1, skip: 0 } as const;
export const EVENT_WEIGHT = { click: 1, save: 0.7, tryon: 0.6, skip: 0.3 } as const;
export type EventKind = keyof typeof EVENT_VALUE;

const features = (s: Signals) => [1, s.optical, s.physical, s.creator, s.graph, s.popularity];
const pairKeys = (traits: string[], attributes: string[]) => traits.flatMap((t) => attributes.map((a) => `${t}|${a}`));

function logit(model: Model, s: Signals, traits: string[], attributes: string[]) {
  const x = features(s);
  const linear = x.reduce((sum, v, i) => sum + v * model.weights[i], 0);
  return pairKeys(traits, attributes).reduce((sum, key) => sum + (model.pairs[key] ?? 0), linear);
}

export function predict(model: Model, s: Signals, traits: string[], attributes: string[]) {
  return sigmoid(logit(model, s, traits, attributes));
}

/** One step of online logistic regression. Rare pairs move faster, then settle as evidence grows. */
export function update(model: Model, s: Signals, traits: string[], attributes: string[], kind: EventKind, rate = 0.05) {
  const x = features(s);
  const gap = EVENT_VALUE[kind] - predict(model, s, traits, attributes);
  const step = rate * EVENT_WEIGHT[kind] * gap;
  model.weights = model.weights.map((w, i) => w + step * x[i]);
  for (const key of pairKeys(traits, attributes)) {
    model.seen[key] = (model.seen[key] ?? 0) + 1;
    const damp = 1 / Math.sqrt(1 + model.seen[key] / 40);
    model.pairs[key] = (model.pairs[key] ?? 0) + step * 1.5 * damp;
  }
  model.events++;
}

/**
 * Thompson sampling. The score is drawn from around the prediction, with more spread when the
 * model has little evidence, so new products still get a chance to be shown.
 */
export function sample(model: Model, s: Signals, traits: string[], attributes: string[], random: () => number = Math.random) {
  const keys = pairKeys(traits, attributes);
  const evidence = keys.length ? keys.reduce((sum, key) => sum + (model.seen[key] ?? 0), 0) / keys.length : 0;
  const spread = 1.1 / Math.sqrt(1 + evidence / 15);
  // Box-Muller gives a normal draw from two uniform ones.
  const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  return sigmoid(logit(model, s, traits, attributes) + normal * spread);
}

/** The pairs behaviour has pushed furthest, for showing what the engine has learned. */
export function strongestPairs(model: Model, count = 8) {
  return Object.entries(model.pairs)
    .filter(([key]) => (model.seen[key] ?? 0) >= 25)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, count)
    .map(([key, weight]) => {
      const [trait, attribute] = key.split("|");
      return { trait, attribute, weight: Math.round(weight * 100) / 100 };
    });
}
