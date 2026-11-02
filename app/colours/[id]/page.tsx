import Link from "next/link";
import { notFound } from "next/navigation";
import { Feed } from "@/components/Feed";
import { families, familyItems } from "@/lib/feed";

export const generateStaticParams = () => families.map((f) => ({ id: f.id }));

export default async function ColourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const family = families.find((f) => f.id === id);
  if (!family) notFound();
  const items = familyItems(id);
  const first = items[0];
  return (
    <Feed
      items={items}
      introPhoto={first?.kind === "product" ? first.product.image : null}
      intro={
        <>
          <h1>{family.name}</h1>
          <p>{family.products.length} products, grouped by colour and finish.</p>
          <div className="actions">
            <Link href={first?.kind === "product" ? `/try-on?product=${encodeURIComponent(first.product.id)}` : "/try-on"} className="btn">
              Try this colour
            </Link>
            <Link href="/" className="link">
              Back to Discover
            </Link>
          </div>
        </>
      }
    />
  );
}
