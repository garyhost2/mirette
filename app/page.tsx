import Link from "next/link";
import { Feed, ScanAction } from "@/components/Feed";
import { Stories } from "@/components/Stories";
import { buildFeed, catalogStats, families, stories } from "@/lib/feed";

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
            {families.slice(0, 5).map((f) => (
              <li key={f.id}>
                <Link href={`/colours/${f.id}`}>{f.name}</Link>
              </li>
            ))}
          </ul>
          <div className="actions">
            <Link href="/try-on" className="btn">
              Try on
            </Link>
            <Link href="/me" className="link">
              See my guide
            </Link>
          </div>
        </>
      }
      intro={
        <>
          <Stories stories={stories()} />
          <h1>See yourself in every shade.</h1>
          <p>{catalogStats.shades.toLocaleString("en-IE")} real shades, tried on your own face.</p>
          <ScanAction done="See my matches" />
        </>
      }
    />
  );
}
