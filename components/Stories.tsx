"use client";

// Creators as stories: a row of circles on Discover, and a full-screen story behind each one.
// Sample portraits are plain <img>, because a story sits above the water surface.
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Story, StoryProduct } from "@/lib/feed";
import { sized } from "@/lib/format";
import { track, useProfile } from "@/lib/profile";
import { CloseIcon } from "./icons";

const PARTS = ["scan", "match", "products"] as const;
const firstName = (story: Story) => story.name.split(" ")[0];

/** The shopper's own version of one product from a look, rebuilt for their skin. */
function Recommendation({ story, product, onClose }: { story: Story; product: StoryProduct; onClose: () => void }) {
  const profile = useProfile();
  const reading = profile?.reading;
  const yours = reading?.translations[story.lookId]?.find((step) => step.type === product.type);
  const fit = yours ? reading?.fits[yours.productId] : undefined;

  return (
    <section className="story-rec" aria-label={`Your recommendation for ${product.typeName}`}>
      <button className="close" onClick={onClose} aria-label="Back to the products">
        <CloseIcon />
      </button>
      <h2>Your {product.typeName.toLowerCase()}</h2>
      <div className="story-pair">
        <figure>
          <i style={{ "--c": product.hex ?? undefined } as CSSProperties} />
          <figcaption>
            <small>{firstName(story)}&apos;s shade</small>
            <strong>{product.title}</strong>
          </figcaption>
        </figure>
        {yours && (
          <figure>
            <i style={{ "--c": yours.hex } as CSSProperties} />
            <figcaption>
              <small>Your version</small>
              <strong>{yours.title}</strong>
              {yours.shade && <span>{yours.shade}</span>}
            </figcaption>
          </figure>
        )}
      </div>
      {fit && (
        <p className="fit">
          {fit.percent}% for you{(fit.reason ?? fit.warning) && ` · ${fit.reason ?? fit.warning}`}
        </p>
      )}
      {yours ? (
        <div className="actions">
          <Link className="btn" href={`/try-on?look=${story.lookId}&product=${encodeURIComponent(yours.productId)}`} onClick={() => track("tryon", yours.productId)}>
            Try it on me
          </Link>
          <a className="link" href={yours.url} target="_blank" rel="noopener noreferrer" onClick={() => track("click", yours.productId)}>
            See at seller
          </a>
        </div>
      ) : (
        <>
          <p className="meta">{profile ? "Reading your scan." : "Scan your face to get your own shade of this product."}</p>
          {!profile && (
            <div className="actions">
              <Link className="btn" href="/try-on">
                Scan my face
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Match({ story, onNext }: { story: Story; onNext: () => void }) {
  const profile = useProfile();
  const match = profile?.reading?.creators.find((c) => c.creatorId === story.id);
  const name = firstName(story);

  if (!profile) {
    return (
      <>
        <h2>How close is your face to {name}&apos;s?</h2>
        <p className="meta">Scan once to see your match with every creator.</p>
        <div className="actions">
          <Link className="btn" href="/try-on">
            Scan my face
          </Link>
        </div>
      </>
    );
  }
  if (!profile.reading) return <h2>Reading your scan</h2>;
  if (!match) return <h2>This sample face is {name}&apos;s.</h2>;
  return (
    <>
      <p className="story-score">{match.score}%</p>
      <h2>Your match with {name}</h2>
      <ul className="story-reasons">
        {match.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="actions">
        <button className="btn" onClick={onNext}>
          See {name}&apos;s products
        </button>
      </div>
    </>
  );
}

/** Opens at one creator and moves through their scan, the shopper's match and their products. */
export function StoryViewer({ stories, start, onClose }: { stories: Story[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const [part, setPart] = useState(0);
  const [held, setHeld] = useState(false);
  const [picked, setPicked] = useState<StoryProduct | null>(null);
  const story = stories[at];
  const showing = PARTS[part];
  const last = PARTS.length - 1;

  const open = (index: number) => {
    setAt(index);
    setPart(0);
    setPicked(null);
  };
  const next = () => {
    if (part < last) setPart(part + 1);
    else if (at < stories.length - 1) open(at + 1);
    else onClose();
  };
  const back = () => {
    if (part > 0) setPart(part - 1);
    else if (at > 0) open(at - 1);
  };
  const hold = { onPointerDown: () => setHeld(true), onPointerUp: () => setHeld(false), onPointerLeave: () => setHeld(false) };

  return (
    <dialog
      className="story"
      tabIndex={-1}
      ref={(el) => {
        if (el && !el.open) {
          el.showModal();
          el.focus();
        }
      }}
      onClose={onClose}
      aria-label={`${story.name}, sample creator`}
    >
      <img className="story-photo" src={story.photo} alt="" />
      {showing === "scan" && <span className="story-sweep" key={story.id} aria-hidden="true" />}
      <div className="story-bars" aria-hidden="true">
        {PARTS.map((name, i) => (
          <i key={name} data-state={i < part ? "done" : undefined}>
            {i === part && (
              <b
                key={`${at}-${part}`}
                style={{ animationPlayState: held || picked ? "paused" : "running" }}
                onAnimationEnd={() => {
                  // The products wait for the shopper, because they are there to be tapped.
                  if (part < last) next();
                }}
              />
            )}
          </i>
        ))}
      </div>
      <header className="story-head">
        <img src={story.photo} alt="" />
        <span>
          <strong>{story.name}</strong>
          <small>Sample creator</small>
        </span>
        <button className="close" onClick={onClose} aria-label="Close the story">
          <CloseIcon />
        </button>
      </header>
      <button className="story-tap back" onClick={back} aria-label="Previous" {...hold} />
      <button className="story-tap next" onClick={next} aria-label="Next" {...hold} />

      <section className="story-panel" key={`${at}-${showing}`}>
        {showing === "scan" && (
          <>
            <h2>{firstName(story)}&apos;s scan</h2>
            <dl className="story-scan">
              {story.scan.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <ul className="story-scores">
              {story.scores.map((score) => (
                <li key={score.label} style={{ "--v": `${score.value}%` } as CSSProperties}>
                  <span>{score.label}</span>
                  <b>{score.value}</b>
                  <i />
                </li>
              ))}
            </ul>
          </>
        )}
        {showing === "match" && <Match story={story} onNext={next} />}
        {showing === "products" && (
          <>
            <h2>{story.lookName}</h2>
            <p className="meta">{story.lookStory}</p>
            <ul className="story-products">
              {story.products.map((product) => (
                <li key={product.id}>
                  <button onClick={() => setPicked(product)}>
                    <img src={sized(product.image, 160)} alt="" />
                    <span>
                      <strong>{product.title}</strong>
                      <small>Get my shade</small>
                    </span>
                    <i style={{ "--c": product.hex ?? undefined } as CSSProperties} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="actions">
              <Link className="link" href={`/look/${story.lookId}`}>
                See it on other skin
              </Link>
            </div>
          </>
        )}
      </section>
      {picked && <Recommendation story={story} product={picked} onClose={() => setPicked(null)} />}
    </dialog>
  );
}

export function Stories({ stories }: { stories: Story[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const reading = useProfile()?.reading;

  return (
    <>
      <div className="stories" aria-label="Creators">
        {stories.map((story, i) => {
          const match = reading?.creators.find((c) => c.creatorId === story.id);
          return (
            <button
              key={story.id}
              className="story-dot"
              data-seen={seen.includes(story.id) || undefined}
              aria-label={`Open ${story.name}'s story`}
              onClick={() => {
                setOpen(i);
                setSeen((list) => [...list, story.id]);
              }}
            >
              <span>
                <img src={story.photo} alt="" />
              </span>
              <small>{match ? `${match.score}%` : firstName(story)}</small>
            </button>
          );
        })}
      </div>
      {open !== null && <StoryViewer stories={stories} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
