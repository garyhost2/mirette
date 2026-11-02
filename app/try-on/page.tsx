import { TryOn } from "@/components/TryOn";
import { SAMPLES } from "@/lib/creators";
import { findProduct, tryOnProducts } from "@/lib/feed";

// The chosen product comes from the link, so this page cannot be prerendered.
export const instant = false;

export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ product?: string; look?: string }> }) {
  const { product, look } = await searchParams;
  const start = product ? findProduct(product) : undefined;
  const products = tryOnProducts();
  const list = start && !products.some((p) => p.id === start.id) ? [start, ...products] : products;
  return <TryOn products={list} startId={start?.id} lookId={look} samples={SAMPLES.map(({ id, photo, face }) => ({ id, photo, skin: face.tone.skin }))} />;
}
