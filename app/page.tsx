import Link from "next/link";
import { Feed } from "@/components/Feed";
import { buildFeed, catalogStats, families } from "@/lib/feed";

export default function DiscoverPage() {
  const items = buildFeed();
  const first = items.find((i) => i.kind === "product");
  return (
    <Feed
      items={items.slice(1)}
      introPhoto={first?.kind === "product" ? first.product.photos[0] : null}
      outro={
        <>
          <h2>Browse by colour</h2>
          <ul className="families">
            {families.slice(0, 7).map((f) => (
              <li key={f.id}>
                <Link href={`/colours/${f.id}`}>{f.name}</Link>
              </li>
            ))}
          </ul>
        </>
      }
      intro={
        <>
          <h1>See yourself in every shade.</h1>
          <p>{catalogStats.shades.toLocaleString("en-IE")} real shades, tried on your own face.</p>
          <div className="actions">
            <Link href="/try-on" className="btn">
              Scan my face
            </Link>
          </div>
        </>
      }
    />
  );
}
