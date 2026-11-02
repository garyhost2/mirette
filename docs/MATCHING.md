# How Mirette decides what suits a face

Every recommendation answers two questions:

- **Optical:** how will this colour and finish look once light hits it on this skin?
- **Physical:** how will this product sit on this face's shape, lids, lips and skin surface?

The rules below are starting points from makeup practice and colour science, not proven facts.
The engine at the end tests them against real behaviour and changes their weights.

## 1. What we read from a selfie

| API | Units | Fields we use |
|---|---|---|
| Facial Color Tones | 20 | `skin_color`, `lip_color`, `eye_color`, `eyebrow_color`, `hair_color` |
| Skin Analysis (SD, 11 concerns) | 14 | oiliness, moisture, radiance, redness, texture, pore, wrinkle, acne, age_spot, dark_circle_v2, skin_type |
| Face Attributes (up to 14 features) | 20 | faceShape, eyeShape, eyeSize, eyeAngle, eyeDistance, eyelid, eyebrowShape, eyebrowThickness, lipShape, cheekbones |
| Makeup try-on | 1 each | The final check on the shopper's own face |

One full scan costs 54 units, so 1,000 units covers about 18 scans and leaves nothing for try-on.
Judges therefore get sample faces with saved results, and live scans are rationed.

We do not use the API's age and gender fields. Fitzpatrick (10 units) adds little beyond the colours.

## 2. Optical traits we calculate

All in CIELAB, because equal distances there look about equally different.

| Trait | How | Why it matters |
|---|---|---|
| Depth | Individual Typology Angle from L* and b* | Which shade range applies |
| Undertone (estimate) | Lab hue angle of skin | Warm, neutral or cool colour families |
| Facial contrast | L* gap between skin and the darkest of hair and brow | How strong a colour the face can carry |
| Sheen | oiliness + radiance | Whether to add or remove shine |
| Surface scatter | texture + pore + wrinkle | Shimmer and powder exaggerate texture |
| Redness and shadows | redness, dark_circle_v2 | Coverage or correction needed |

## 3. The key idea: predict the colour on the face, not in the tube

Makeup is a thin layer, so the skin or lip shows through. We estimate what the eye will see:

    on_face = natural colour + weight × (product colour - natural colour)

The weight follows a smooth curve of coverage rather than a straight line, because makeup sits as
separate particles over partly exposed skin (Park et al. 2026, see `RESEARCH.md`).

Opacity comes from the product: sheer tint about 0.35, foundation about 0.6, full cover about 0.85,
gloss about 0.4, matte lipstick about 0.9, blush about 0.3. These values are estimates to tune.

The same gloss looks different on different lips, and a sheer tint forgives a shade that a
full-cover foundation would not. A simple shade match misses both.

## 4. Rules for each product

| Product | Optical rule | Physical rule |
|---|---|---|
| Foundation, concealer | Smallest ΔE between on-face colour and skin. Warn above about 5 | Oily or large pores: matte or blurring. Dry or textured: hydrating or dewy. Acne: non-comedogenic if listed |
| Concealer for dark circles | Slightly lighter than skin, with a warm corrector on deeper skin | Crepey under-eye: thin cream, avoid heavy powder |
| Powder | Close to skin; warn if lighter than deep skin (ashy cast) | Only when oily. Avoid when dry or textured |
| Blush | Visible flush on skin, warm or cool to match undertone. Warn about ashy shades on deep skin | Face shape sets placement. Cream on dry skin, powder on oily |
| Bronzer, contour | Deeper than skin by a set L* band, not orange on fair skin | Use YouCam's contour patterns for each face shape |
| Highlighter | Lighter than skin, tuned to undertone | High texture: satin, not glitter. High or flat cheekbones change placement |
| Lipstick | Target contrast with skin from facial contrast; undertone family; predict on the natural lip | Thin lips: lighter, gloss, liner. Full lips: deep and matte work. Dry lips: avoid long-wear matte |
| Gloss | Predict on the natural lip, because it is sheer | Adds visual volume through highlights on thin lips |
| Eyeshadow | Colours opposite the iris on the hue wheel make eyes stand out | Hooded lids: matte and transfer-proof. Close-set or wide-set eyes change placement |
| Eyeliner, mascara | Depth from hair and brow colour: black, brown or soft | Hooded or single lid: waterproof, smudge-proof, thin line. Downturned eyes: lifted wing |
| Brows | Close to `eyebrow_color`, lighter than hair on dark hair | Sparse: pencil or tinted gel. Dense: clear gel |

## 5. Product side

The scraper gives colour, type, price and sellers. Everything else comes from title, tags and
description: finish (matte, satin, dewy, gloss, shimmer, metallic), coverage, formula (cream,
liquid, powder, stick), and claims (waterproof, long-wear, hydrating, oil-free, non-comedogenic).

Shade colours are estimated from images and so are approximate. A real swatch beats a picture of a
bottle, and the app must not present these as exact.

## 6. Creator match

A creator's look only transfers if the traits that matter for that look are shared, so the score is
per look, not per person:

    match(look) = weights from the look's products × similarity on each trait

| Look | Weighted most on |
|---|---|
| Eye look | Eyelid type, eye shape, eye colour, contrast |
| Lip look | Lip shape, natural lip colour, skin depth, undertone |
| Face look | Skin depth, undertone, texture, face shape |

Colours are compared with ΔE, and shapes by how much they change the technique. The app shows the
reason, such as "same hooded lids, 96% skin depth match". This compares traits and never
identifies a person.

## 7. Graph in Neo4j

    (Trait)-[:NEEDS {weight}]->(Attribute)<-[:HAS]-(Product)
    (Product)-[:SOLD_BY {priceEur}]->(Seller)
    (Product)-[:SAME_COLOUR_AS {deltaE, saveEur}]->(Product)
    (Product)-[:IN_FAMILY]->(Family)
    (Creator)-[:MADE]->(Look)-[:USES]->(Product)
    (Trait)-[:GUIDED_BY]->(Guide)

No shopper or face enters the graph. Traits are categories, such as `oily` or `depth:deep`.
Colour families fill the app's sections.

## 8. The maths engine

For shopper u and shade i:

    score(u, i) = sigmoid(w0 + w1·optical + w2·physical + w3·creator + w4·graph + w5·popularity + Σ pair weights)

- **Signals:** outbound click is a strong yes, save and try-on are yes, and a quick skip is a weak no.
- **Learning:** online logistic regression updates the weights after each signal, and the same
  update adjusts the `Trait -> Attribute` weights. That is how behaviour corrects the rules.
- **Exploration:** Thompson sampling occasionally shows less-tested products, so new ones get a chance.
- **Starting point:** labelled simulated shoppers, replaced as real behaviour arrives.

## 9. Limits to be honest about

- Selfie colour depends on the light and camera, so we guide the capture.
- Shade colours are estimated from images, and opacity values are estimates.
- Simulated shoppers show that the engine learns, not that its advice is right.
- No medical claims. Skin scores are cosmetic guidance.
