// The shade gap: how much of the catalog really reaches each skin tone. Writes data/equity.json.
// Skin tones are grouped by Individual Typology Angle, which needs no judgement about a person.
// Shade colours are estimates read from product images, so this is an indication, not a market study.
// Run: npm run equity

import { readFileSync, writeFileSync } from "node:fs";
import { deltaE, ita } from "../lib/color";

/** Within this distance a foundation reads as the wearer's own skin. */
const CLOSE = 4;
const TYPES = ["foundation", "concealer"];

/** One reference skin for each standard ITA band. */
const BANDS = [
  { name: "Very light", hex: "#f5e4d6" },
  { name: "Light", hex: "#e8c7a9" },
  { name: "Intermediate", hex: "#d2a47c" },
  { name: "Tan", hex: "#b4825a" },
  { name: "Brown", hex: "#80533a" },
  { name: "Dark", hex: "#4a2d20" },
];

type Product = { id: string; type: string; shades: { name: string; hex: string | null }[] };
const { products } = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: Product[] };
const complexion = products.filter((p) => TYPES.includes(p.type) && p.shades.some((s) => s.hex));
const shades = complexion.flatMap((p) => p.shades.flatMap((s) => (s.hex ? [s.hex] : [])));

const bands = BANDS.map((band) => {
  const nearby = shades.filter((hex) => deltaE(hex, band.hex) <= CLOSE).length;
  const reached = complexion.filter((p) => p.shades.some((s) => s.hex && deltaE(s.hex, band.hex) <= CLOSE)).length;
  return {
    band: band.name,
    ita: Math.round(ita(band.hex)),
    shades: nearby,
    shareOfShades: Math.round((nearby / shades.length) * 1000) / 10,
    products: reached,
    shareOfProducts: Math.round((reached / complexion.length) * 1000) / 10,
  };
});

const report = { note: "Foundation and concealer shades within ΔE 4 of a reference skin. Colours are estimated from images.", products: complexion.length, shades: shades.length, bands };
writeFileSync(new URL("../data/equity.json", import.meta.url), JSON.stringify(report, null, 2));
console.table(bands);
