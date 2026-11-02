"use client";

import Link from "next/link";
import { euro } from "@/lib/format";
import { clearFace, toggleSaved, useProfile, useSaved } from "@/lib/profile";

/** The shopper's part of the graph: their traits on the left, what suits them on the right. */
function Graph({ edges }: { edges: { trait: string; attribute: string; weight: number; products: number }[] }) {
  const traits = [...new Set(edges.map((e) => e.trait))];
  const attributes = [...new Set(edges.map((e) => e.attribute))];
  const row = 30;
  const height = Math.max(traits.length, attributes.length) * row;
  const y = (list: string[], name: string) => (height - list.length * row) / 2 + list.indexOf(name) * row + row / 2;
  return (
    <svg className="graph" viewBox={`0 0 340 ${height}`} role="img" aria-label="Your traits linked to what suits them">
      {edges.map((e) => (
        <path
          key={`${e.trait}-${e.attribute}`}
          d={`M116 ${y(traits, e.trait)} C170 ${y(traits, e.trait)} 170 ${y(attributes, e.attribute)} 224 ${y(attributes, e.attribute)}`}
          fill="none"
          stroke="#cfa84f"
          strokeWidth={Math.max(0.6, e.weight * 1.6)}
        />
      ))}
      {traits.map((t) => (
        <text key={t} x="110" y={y(traits, t) + 5} textAnchor="end" fill="#f6f1e7" fontSize="14">
          {t}
        </text>
      ))}
      {attributes.map((a) => (
        <text key={a} x="230" y={y(attributes, a) + 5} fill="#f6f1e7" fontSize="14">
          {a}
        </text>
      ))}
    </svg>
  );
}

function Saved() {
  const items = useSaved();
  if (!items.length) return null;
  return (
    <>
      <h2>Saved</h2>
      <ul className="saved">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/try-on?product=${encodeURIComponent(item.id)}`}>
              <strong>{item.title}</strong>
              <span>
                {item.brand} · from {euro(item.priceFrom)}
              </span>
            </Link>
            <button className="link" onClick={() => toggleSaved(item)} aria-label={`Remove ${item.title}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Me() {
  const profile = useProfile();
  const reading = profile?.reading;

  if (!profile) {
    return (
      <div className="me-page scanned">
        <h1>Me</h1>
        <p>Your scan, your colours and everything you save will live here.</p>
        <div className="actions">
          <Link href="/try-on" className="btn">
            Scan my face
          </Link>
        </div>
        <Saved />
      </div>
    );
  }

  return (
    <div className="me-page scanned">
      <h1>Your face</h1>
      <p>{reading ? reading.traits.join(", ") : "Reading your scan"}</p>
      {profile.face.source === "device" && <p className="meta">Quick reading made on this device. A full YouCam scan also reads your skin and eyelids.</p>}
      {reading && (
        <>
          <h2>What your face needs</h2>
          <ul className="needs">
            {reading.needs.slice(0, 4).map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <span>{n.advice}</span>
              </li>
            ))}
          </ul>
          <p className="meta">
            {reading.reach.near.toLocaleString("en-IE")} of {reading.reach.total.toLocaleString("en-IE")} foundation shades here read as your own skin.
          </p>
          <h2>Closest creators</h2>
          <ol className="closest">
            {reading.creators.map((c) => (
              <li key={c.creatorId}>
                <Link href={`/creators#${c.creatorId}`}>
                  <span>{c.name}</span>
                  <span>{c.score}%</span>
                </Link>
              </li>
            ))}
          </ol>
          <h2>Your colours</h2>
          <ul className="families">
            {reading.families.map((f) => (
              <li key={f.id}>
                <Link href={`/colours/${f.id}`}>{f.name}</Link>
              </li>
            ))}
          </ul>
          <h2>What suits you</h2>
          <Graph edges={reading.graphView.edges} />
          <p className="meta">
            Learned from {reading.model.simulated.toLocaleString("en-IE")} simulated actions and {reading.model.real.toLocaleString("en-IE")} real ones.
          </p>
        </>
      )}
      <Saved />
      <div className="actions">
        <button className="link" onClick={clearFace}>
          Delete my scan
        </button>
      </div>
    </div>
  );
}
