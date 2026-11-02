// Shops that publish a public product feed and whose robots.txt does not block it.
// Big retailers with no public feed are left out on purpose: the scraper never gets around a block.
export const SELLERS = [
  { id: "revolution", name: "Revolution Beauty", origin: "https://www.revolutionbeauty.com", multibrand: false },
  { id: "nabla", name: "NABLA Cosmetics", origin: "https://www.nablacosmetics.com", multibrand: false },
  { id: "pixi", name: "Pixi Beauty", origin: "https://www.pixibeauty.com", multibrand: false },
  { id: "rare", name: "Rare Beauty", origin: "https://www.rarebeauty.com", multibrand: false },
  { id: "fenty", name: "Fenty Beauty", origin: "https://www.fentybeauty.com", multibrand: false },
  { id: "bperfect", name: "BPerfect Cosmetics", origin: "https://www.bperfectcosmetics.com", multibrand: false },
  { id: "sculpted", name: "Sculpted By Aimee", origin: "https://www.sculptedbyaimee.com", multibrand: false },
  { id: "naturisimo", name: "Naturisimo", origin: "https://www.naturisimo.com", multibrand: true },
  { id: "content", name: "Content Beauty", origin: "https://www.contentbeautywellbeing.com", multibrand: true },
  { id: "skincupid", name: "Skin Cupid", origin: "https://www.skincupid.co.uk", multibrand: true },
];
