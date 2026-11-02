# Mirette design

Se mirer means to see yourself in water. Every screen is one photograph standing above a line of
black water, with its reflection rippling below. The interface is almost nothing else.

## Colour

- Ground: black water `#0b0a08`.
- Ink: ivory `#f6f1e7`, softer `#cdc6b7` for secondary text.
- Primary action: a flat ivory button. It turns gold `#cfa84f` when pressed.
- Gold also marks a saved heart and the active tab icon. All other colour comes from the photograph and the real shades.

## Type

One family, Sentient, self-hosted in `app/fonts`, weight 300. Sizes: 14, 17, 26 and 40px.
Sentence case everywhere.

## Layout

The app is a phone-shaped column of 460px at most, on desktop too. The waterline sits 30% up the
screen. Words stay on the water, the photo stays clear of them. No cards, borders, shadows, glass
or eyebrow labels. Tabs pair a thin icon with a small label. Square corners. The logo turns black or
ivory to suit each photo.

## Photographs

`data/features.json` is chosen by eye from the sellers' own galleries by `scraper/features.mjs`.
Pick clean shots with no text printed on them. Sellers' photos reach the canvas through
`/_next/image`, so WebGL may read them. They belong to the brands, so the public demo runs with `BRAND_FREE=1`.

## Motion

`lib/basin.ts` is a WebGL2 height-field water surface with one canvas.

- Scrolling and swiping pass from one photo to the next as a wave, tied to the scroll position.
- A screen opens with the picture rising out of black.
- A tap sets off a ring, a finger leaves a trail, and small drops fall on their own.
- The photo breathes slowly, and the reflection swells towards the viewer.
- Words rise into place, one line after another, when their card arrives.
- Without WebGL2 the app shows plain images. With reduced motion the water holds still.

## Honesty

Sample creators and sample faces stay labelled. Shade colours are estimates read from photos.
