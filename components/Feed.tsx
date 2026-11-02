"use client";

// Seller and sample images are plain <img>: the shopping photos are drawn in WebGL, not by next/image.
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { basin, photoUrl } from "@/lib/basin";
import { creatorOf } from "@/lib/creators";
import type { FeedItem, FeedProduct } from "@/lib/feed";
import { euro, sized } from "@/lib/format";
import { toggleSaved, track, useProfile, useSaved, type Reading } from "@/lib/profile";
import { CloseIcon, HeartIcon, OutIcon } from "./icons";

const QUICK_SKIP_MS = 1200;

/** Tells a card when it is the one on screen, so its words can rise in. */
function useActive(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { root: el.closest(".feed"), threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

function ProductSheet({ product, shade, onClose }: { product: FeedProduct; shade: string; onClose: () => void }) {
  return (
    <dialog
      className="sheet"
      tabIndex={-1}
      ref={(el) => {
        if (el && !el.open) {
          el.showModal();
          el.focus();
        }
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={product.title}
    >
      <button className="close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
      <img className="sheet-photo" src={sized(product.image, 720)} alt={product.title} decoding="async" />
      <h2>{product.title}</h2>
      <p className="sheet-meta">
        {product.brand}
        {shade && ` · ${shade}`}
      </p>
      <ul>
        {product.offers.map((o) => (
          <li key={o.seller}>
            <a className="offer" href={o.url} target="_blank" rel="noopener noreferrer" onClick={() => track("click", product.id)}>
              <span>
                <strong>{o.sellerName}</strong>
                <small>{o.available ? "In stock" : "Out of stock"}</small>
              </span>
              <span className="offer-price">
                <b>{euro(o.priceEur)}</b>
                <OutIcon />
              </span>
            </a>
          </li>
        ))}
      </ul>
      {product.cheaper.length > 0 && (
        <>
          <h3>Same colour for less</h3>
          <ul>
            {product.cheaper.map((c) => (
              <li key={c.brand + c.title + c.shade}>
                <a className="offer" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => track("click", product.id)}>
                  <span className="match">
                    <i style={{ "--c": c.hex } as CSSProperties} />
                    <span>
                      <strong>{c.title}</strong>
                      <small>
                        {c.brand} · {c.shade}
                      </small>
                    </span>
                  </span>
                  <span className="offer-price">
                    <b>{euro(c.priceEur)}</b>
                    <OutIcon />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">
        {product.sizesMayDiffer && "Pack sizes may differ between these sellers. "}
        Prices are converted to euros and exclude delivery. Shade colours are estimates read from product photos.
      </p>
    </dialog>
  );
}

function ProductCard({ product, onPhoto }: { product: FeedProduct; onPhoto: (url: string) => void }) {
  const pages = useMemo(
    () => [...product.photos.map((url) => ({ url, shade: null })), ...product.shades.filter((s) => s.image).map((s) => ({ url: s.image!, shade: s }))],
    [product],
  );
  const pager = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const on = useActive(card);
  const [index, setIndex] = useState(0);
  const saved = useSaved().some((s) => s.id === product.id);
  const [open, setOpen] = useState(false);
  const shade = pages[index]?.shade;
  const profile = useProfile();
  const fit = profile?.reading?.fits[product.id];

  useEffect(() => {
    if (on) basin.preload([pages[index + 1]?.url, pages[index + 2]?.url]);
  }, [on, index, pages]);

  useEffect(() => {
    if (!on) return;
    const arrived = Date.now();
    return () => {
      if (Date.now() - arrived < QUICK_SKIP_MS) track("skip", product.id);
    };
  }, [on, product.id]);

  function onScroll() {
    const el = pager.current;
    if (!el || !el.clientWidth) return;
    const at = el.scrollLeft / el.clientWidth;
    const left = Math.floor(at);
    basin.show(pages[left]?.url ?? null, pages[left + 1]?.url ?? null, at - left);
    const next = Math.max(0, Math.min(pages.length - 1, Math.round(at)));
    onPhoto(pages[next].url);
    if (next === index) return;
    setIndex(next);
    basin.ring(0.5);
    const dot = rail.current?.querySelector<HTMLElement>(`[data-page="${next}"]`);
    if (dot && rail.current) rail.current.scrollTo({ left: dot.offsetLeft - rail.current.clientWidth / 2 + 22, behavior: "smooth" });
  }

  return (
    <article className="card" ref={card} data-on={on || undefined}>
      <div className="pager" ref={pager} onScroll={onScroll} aria-label={`${product.title} photos`}>
        {pages.map((p, i) => (
          <div className="page" key={p.url + i} role="img" aria-label={p.shade ? `${product.title}, shade ${p.shade.name}` : product.title}>
            <img className="still" src={photoUrl(p.url)} alt="" loading="lazy" />
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>{shade?.name ?? product.title}</h2>
        <p className="meta">
          {shade ? product.title : product.brand} · from <b>{euro(product.priceFrom)}</b>
        </p>
        {fit && (
          <p className="fit">
            {fit.percent}% for you{(fit.reason ?? fit.warning) && ` · ${fit.reason ?? fit.warning}`}
          </p>
        )}
        <div className="row">
          <div className="rail" ref={rail} aria-label="Choose a shade">
            {pages.map((p, i) =>
              p.shade?.hex ? (
                <button
                  key={p.shade.name}
                  className="swatch"
                  data-page={i}
                  data-best={p.shade.name === fit?.shade || undefined}
                  style={{ "--c": p.shade.hex } as CSSProperties}
                  aria-pressed={i === index}
                  aria-label={p.shade.name}
                  onClick={() => pager.current?.scrollTo({ left: i * pager.current.clientWidth, behavior: "smooth" })}
                >
                  <i />
                </button>
              ) : null,
            )}
          </div>
          <button
            className="icon"
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save"}
            onClick={() => toggleSaved({ id: product.id, title: product.title, brand: product.brand, image: product.photos[0] ?? product.image, priceFrom: product.priceFrom })}
          >
            <HeartIcon />
          </button>
        </div>
        <div className="actions">
          <Link className="btn" href={`/try-on?product=${encodeURIComponent(product.id)}`} onClick={() => track("tryon", product.id)}>
            Try on
          </Link>
          <button className="link" onClick={() => setOpen(true)}>
            {product.offers.length > 1 ? `Compare ${product.offers.length} sellers` : `See at ${product.offers[0].sellerName}`}
          </button>
        </div>
      </div>
      {open && <ProductSheet product={product} shade={shade?.name ?? ""} onClose={() => setOpen(false)} />}
    </article>
  );
}

function LookCard({ item }: { item: Extract<FeedItem, { kind: "look" }> }) {
  const { look, products } = item;
  const creator = creatorOf(look);
  const card = useRef<HTMLElement>(null);
  const on = useActive(card);
  const reading = useProfile()?.reading;
  const match = reading?.creators.find((c) => c.creatorId === creator.id);
  const yours = reading?.translations[look.id];
  const tiles = yours?.length ? yours : products.map((p) => ({ productId: p.id, type: p.type, title: p.title, image: p.image, shade: null, hex: "", url: p.offers[0].url }));

  return (
    <article className="card" id={creator.id} ref={card} data-on={on || undefined}>
      <div className="pager" role="img" aria-label={`${creator.name}, sample creator`}>
        {creator.face && <img className="still" src={creator.face} alt="" loading="lazy" />}
      </div>
      <div className="panel">
        <h2>{look.name}</h2>
        <p className="meta">
          {creator.name} · <b>Sample creator</b> · {yours?.length ? "Re-matched to your skin" : look.story}
        </p>
        {match && (
          <p className="fit">
            {match.score}% match · {match.reasons[0]}
          </p>
        )}
        <div className="tiles" aria-label={`Products in ${look.name}`}>
          {tiles.map((p) => (
            <a className="tile" key={p.productId} href={p.url} target="_blank" rel="noopener noreferrer" onClick={() => track("click", p.productId)}>
              <img src={sized(p.image, 240)} alt={p.title} loading="lazy" decoding="async" />
              {p.hex && <i style={{ "--c": p.hex } as CSSProperties} title={`Your shade: ${p.shade}`} />}
            </a>
          ))}
        </div>
        <div className="actions">
          <Link className="btn" href={`/try-on?look=${look.id}&product=${encodeURIComponent(tiles[0]?.productId ?? "")}`}>
            Try this look
          </Link>
          <Link className="link" href={`/look/${look.id}`}>
            See it on other skin
          </Link>
        </div>
      </div>
    </article>
  );
}

const firstPhoto = (item: FeedItem) => (item.kind === "look" ? creatorOf(item.look).face ?? null : item.product.photos[0] ?? item.product.image);

const idOf = (item: FeedItem) => (item.kind === "look" ? item.look.creatorId : item.product.id);

/** After a scan the best fits come first. Looks keep their places, and the closest creators lead them. */
function personalised(items: FeedItem[], reading: Reading) {
  const rank = (item: FeedItem) => {
    if (item.kind === "product") return -(reading.fits[item.product.id]?.percent ?? 0);
    const place = reading.creators.findIndex((c) => c.creatorId === item.look.creatorId);
    return place < 0 ? 99 : place;
  };
  const byRank = (a: FeedItem, b: FeedItem) => rank(a) - rank(b);
  const products = items.filter((i) => i.kind === "product").sort(byRank);
  const looks = items.filter((i) => i.kind === "look").sort(byRank);
  return items.map((item) => (item.kind === "product" ? products.shift()! : looks.shift()!));
}

export function Feed({ items, intro, introPhoto, outro }: { items: FeedItem[]; intro: ReactNode; introPhoto: string | null; outro?: ReactNode }) {
  const opening = useRef<HTMLElement>(null);
  const on = useActive(opening);
  const reading = useProfile()?.reading;

  const sorted = useMemo(() => (reading ? personalised(items, reading) : items), [items, reading]);

  // The photo each card is showing now, which a horizontal swipe can change.
  const shown = useRef(new Map<string, string>());
  const photoAt = (i: number) => {
    if (i === 0) return introPhoto;
    const item = sorted[i - 1];
    return item ? (shown.current.get(idOf(item)) ?? firstPhoto(item)) : null;
  };

  useEffect(() => {
    basin.open(introPhoto);
  }, [introPhoto]);

  useEffect(() => {
    basin.preload(sorted.slice(0, 2).map(firstPhoto));
  }, [sorted]);

  return (
    <div
      className="feed"
      onScroll={(e) => {
        const el = e.currentTarget;
        const at = el.scrollTop / el.clientHeight;
        const top = Math.floor(at);
        basin.show(photoAt(top), photoAt(top + 1), at - top);
        basin.preload([photoAt(top + 2)]);
      }}
    >
      <section className="intro" ref={opening} data-on={on || undefined}>
        {intro}
      </section>
      {sorted.map((item) =>
        item.kind === "product" ? <ProductCard key={item.product.id} product={item.product} onPhoto={(url) => shown.current.set(item.product.id, url)} /> : <LookCard key={item.look.id} item={item} />,
      )}
      {outro && (
        <section className="intro browse" data-on>
          {outro}
        </section>
      )}
    </div>
  );
}
