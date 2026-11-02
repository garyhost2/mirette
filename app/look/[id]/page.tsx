/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { WaterScene } from "@/components/Water";
import { LOOKS } from "@/lib/creators";
import { translationTable } from "@/lib/recommend";

export const generateStaticParams = () => LOOKS.map((l) => ({ id: l.id }));

/** One look on every sample face: the shade changes, and the effect on the skin stays the same. */
export default async function LookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const table = translationTable(id);
  if (!table) notFound();
  return (
    <div className="compare">
      <WaterScene photo={null} />
      <h1>{table.look}, on every skin</h1>
      <p>Different shades, each chosen to match the same effect against the skin. {table.creator} is a sample creator.</p>
      <ul>
        {table.rows.map((r) => (
          <li key={r.id}>
            <figure>
              <div>
                <img src={r.photo} alt="" />
                <i style={{ "--c": r.hex } as CSSProperties} />
              </div>
              <figcaption>
                <strong>{r.title}</strong>
                <span>
                  {r.contrast}% contrast with skin{!r.close && " · closest we stock"}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
