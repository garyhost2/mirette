"use client";

/* eslint-disable @next/next/no-img-element */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { basin } from "@/lib/basin";
import { hexToLab, hexToRgb, shadeWord } from "@/lib/color";
import type { FeedProduct } from "@/lib/feed";
import { euro } from "@/lib/format";
import { lightIsUneven, prepareSelfie, previewLayers, readFaceOnDevice, type Layer } from "@/lib/preview";
import { setFace, toggleSaved, track, useProfile, useSaved } from "@/lib/profile";
import { ProductSheet } from "./Feed";
import { GuidedSelfie } from "./GuidedSelfie";
import { HeartIcon } from "./icons";

/** One tab for each kind of makeup. The shades of every product of that kind share its rail. */
const TABS = [
  { type: "lipstick", label: "Lip colour" },
  { type: "lip_gloss", label: "Lip gloss" },
  { type: "lip_liner", label: "Lip liner" },
  { type: "foundation", label: "Foundation" },
  { type: "concealer", label: "Concealer" },
  { type: "powder", label: "Powder" },
  { type: "blush", label: "Blush" },
  { type: "bronzer", label: "Bronzer" },
  { type: "highlighter", label: "Highlighter" },
  { type: "eyeshadow", label: "Eyeshadow" },
  { type: "eyeliner", label: "Eyeliner" },
  { type: "mascara", label: "Mascara" },
  { type: "brow", label: "Brow" },
];

/** The real stages of a scan, so the wait says what is happening. */
const STAGES = ["Preparing your photo", "Reading your skin, colours and face shape", "Matching shades to your face"];

type Swatch = { productId: string; name: string; hex: string; lightness: number };
type Family = { name: string; swatches: Swatch[] };
const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1);
/** Two shades this close look the same in a small circle, so only one is shown. */
const colourKey = (hex: string) => hexToRgb(hex).map((v) => Math.round(v / 12)).join();

type Sample = { id: string; photo: string; skin: string };
type Step = Layer & { productId: string };

export function TryOn({ products, startId, lookId, samples }: { products: FeedProduct[]; startId?: string; lookId?: string; samples: Sample[] }) {
  const first = products.find((p) => p.id === startId) ?? products[0];
  const [type, setType] = useState(first?.type ?? "lipstick");
  const [productId, setProductId] = useState<string | undefined>(startId);
  const [picked, setPicked] = useState<string>();
  /** The clean photo every shade is applied to. */
  const [ownPhoto, setPhoto] = useState<string | null>(null);
  const [chosenSample, setSample] = useState<Sample | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [guided, setGuided] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
  /** Which stage of a scan is running, and the photo being read. Null when no scan is running. */
  const [stage, setStage] = useState<number | null>(null);
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const appliedLook = useRef(false);
  const latest = useRef(0);
  const profile = useProfile();

  // A shopper who already picked a sample face comes straight back to it. Selfies are never stored.
  const remembered = !choosing && profile?.face.source === "sample" ? samples.find((s) => s.skin === profile.face.tone.skin) : undefined;
  const sample = chosenSample ?? remembered ?? null;
  const photo = ownPhoto ?? remembered?.photo ?? null;

  const fits = profile?.reading?.fits;
  const tabs = useMemo(() => TABS.filter((t) => products.some((p) => p.type === t.type)), [products]);
  // The products that suit this face come first, so their shades win when two look alike.
  const ranked = useMemo(() => products.filter((p) => p.type === type).sort((a, b) => (fits?.[b.id]?.percent ?? 0) - (fits?.[a.id]?.percent ?? 0)), [products, type, fits]);
  const product = ranked.find((p) => p.id === productId) ?? ranked[0];
  const fit = product ? fits?.[product.id] : undefined;
  const families = useMemo(() => {
    const seen = new Set<string>();
    const list = new Map<string, Swatch[]>();
    const swatches = ranked.flatMap((p) =>
      [...p.shades]
        .sort((a, b) => Number(b.name === fits?.[p.id]?.shade) - Number(a.name === fits?.[p.id]?.shade))
        .flatMap((s) => {
          if (!s.hex || seen.has(colourKey(s.hex))) return [];
          seen.add(colourKey(s.hex));
          const lab = hexToLab(s.hex);
          return [{ swatch: { productId: p.id, name: s.name, hex: s.hex, lightness: lab.L }, family: titleCase(shadeWord(lab, p.group)) }];
        }),
    );
    for (const { swatch, family } of swatches.sort((a, b) => b.swatch.lightness - a.swatch.lightness)) list.set(family, [...(list.get(family) ?? []), swatch]);
    return [...list].map(([name, shades]): Family => ({ name, swatches: shades }));
  }, [ranked, fits]);
  // The engine's best shade leads until the shopper chooses their own.
  const best = product?.shades.find((s) => s.name === fit?.shade)?.name;
  const shade = picked ?? best ?? product?.shades[0]?.name;
  const saved = useSaved().some((s) => s.id === product?.id);

  useEffect(() => {
    basin.open(photo ?? samples[0].photo);
  }, [photo, samples]);

  // A new tab opens with the shade that suits this face in view.
  useEffect(() => {
    const strip = rail.current;
    const target = strip?.querySelector<HTMLElement>('[aria-pressed="true"], [data-best="true"]');
    if (strip) strip.scrollLeft = target ? target.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + 22 : 0;
  }, [type, fits]);

  /** Shows the on-device preview at once, then the YouCam render if it is available. */
  async function wear(steps: Step[]) {
    if (!photo) return;
    const turn = ++latest.current;
    setBusy(true);
    setNote(null);
    basin.ring();
    const quick = await previewLayers(photo, steps).catch(() => null);
    if (turn !== latest.current) return;
    if (quick) basin.show(quick);

    const res = await fetch("/api/try-on", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: steps.map(({ productId: id, hex }) => ({ productId: id, hex })), fileId: profile?.fileId, samplePhoto: sample?.photo }),
    }).catch(() => null);
    const reply = await res?.json().catch(() => null);
    if (turn !== latest.current) return;
    setBusy(false);
    if (res?.ok && reply?.url) {
      basin.show(reply.url);
      setNote("Rendered by YouCam.");
    } else if (quick) {
      setNote("Quick preview on this device.");
    } else {
      setNote(reply?.error ?? "No clear face in this photo. Try another.");
    }
  }

  // A creator's look goes on all at once, in the shades re-matched to this face.
  const lookSteps = lookId ? profile?.reading?.translations[lookId] : undefined;
  useEffect(() => {
    if (!photo || !lookSteps?.length || appliedLook.current) return;
    appliedLook.current = true;
    void wear(lookSteps.map(({ productId: id, type, hex }) => ({ productId: id, type, hex })));
    // wear reads the latest photo and profile when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, lookSteps]);

  async function scan(body: FormData) {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/scan", { method: "POST", body }).catch(() => null);
    const reply = await res?.json().catch(() => null);
    setBusy(false);
    return res?.ok && reply?.face ? { face: reply.face, fileId: reply.fileId as string | undefined } : { error: (reply?.error as string) ?? "That did not work. Try again." };
  }

  async function takeSelfie(file?: File, sides: File[] = []) {
    if (!file) return;
    setBusy(true);
    setNote(null);
    setStage(0);
    setScanPhoto(URL.createObjectURL(file));
    const ready = await prepareSelfie(file).catch(() => null);
    if (!ready) {
      setBusy(false);
      setStage(null);
      setNote("That photo could not be opened. Try a JPEG or PNG.");
      return;
    }
    const url = URL.createObjectURL(ready);
    setStage(1);
    // Side photos are read on this device and are never sent anywhere.
    const sideUrls = sides.map((s) => URL.createObjectURL(s));
    const body = new FormData();
    body.set("photo", ready);
    const result = await scan(body);
    if ("face" in result) {
      setStage(2);
      await setFace(result.face, result.fileId);
    } else {
      // With no key, or no units left, the phone reads what it can by itself.
      setBusy(true);
      const local = await readFaceOnDevice(url, sideUrls).catch(() => null);
      setBusy(false);
      if (!local) {
        setStage(null);
        setNote("No clear face in this photo. Face the light and try again.");
        return;
      }
      setStage(2);
      await setFace(local);
    }
    const uneven = sideUrls.length ? await lightIsUneven(url, sideUrls).catch(() => false) : false;
    sideUrls.forEach((u) => URL.revokeObjectURL(u));
    setSample(null);
    setPhoto(url);
    setChoosing(false);
    setStage(null);
    if (uneven) setNote("The light was uneven across your face, so colours may be slightly off.");
  }

  const finishGuided = useCallback((frames: File[]) => {
    setGuided(false);
    const [front, ...sides] = frames;
    void takeSelfie(front, sides);
    // takeSelfie only uses state setters and the current face store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickSample(chosen: Sample) {
    const body = new FormData();
    body.set("sample", chosen.id);
    const result = await scan(body);
    if ("error" in result) {
      setNote(result.error ?? null);
      return;
    }
    setStage(2);
    setScanPhoto(chosen.photo);
    await setFace(result.face);
    setSample(chosen);
    setPhoto(chosen.photo);
    setChoosing(false);
    setStage(null);
  }

  function choose(swatch: Swatch) {
    setProductId(swatch.productId);
    setPicked(swatch.name);
    track("tryon", swatch.productId);
    void wear([{ productId: swatch.productId, type, hex: swatch.hex }]);
  }

  function openTab(next: string) {
    setType(next);
    setProductId(undefined);
    setPicked(undefined);
  }

  return (
    <div className="tryon">
      {stage !== null && (
        <section className="scanning" role="status" aria-live="polite" aria-label="Reading your face">
          {scanPhoto && <img src={scanPhoto} alt="" />}
          <span className="story-sweep" aria-hidden="true" />
          <div className="scanning-panel">
            <h1>Reading your face</h1>
            <ol>
              {STAGES.map((text, i) => (
                <li key={text} data-state={i < stage ? "done" : i === stage ? "now" : undefined}>
                  {text}
                </li>
              ))}
            </ol>
            <p className="meta scanning-wait">This can take up to a minute.</p>
          </div>
        </section>
      )}
      {guided && (
        <GuidedSelfie
          onDone={finishGuided}
          onClose={() => setGuided(false)}
          onUpload={() => {
            setGuided(false);
            input.current?.click();
          }}
        />
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        aria-label="Take or choose a selfie"
        onChange={(e) => {
          void takeSelfie(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!photo ? (
        <section className="panel" data-on>
          <h1>{busy ? "Reading your face" : "See it on your face."}</h1>
          <p className="meta">{note ?? (choosing ? "These are AI-made sample faces." : "Face the light and look straight ahead.")}</p>
          {choosing ? (
            <div className="faces">
              {samples.map((s) => (
                <button key={s.id} disabled={busy} onClick={() => pickSample(s)} aria-label={`Use sample face ${s.id}`}>
                  <img src={s.photo} alt="" />
                </button>
              ))}
            </div>
          ) : (
            <div className="actions">
              <button className="btn" disabled={busy} onClick={() => setGuided(true)}>
                Take a selfie
              </button>
              <button className="link" disabled={busy} onClick={() => setChoosing(true)}>
                Use a sample face
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="panel" aria-label="Makeup">
          <div className="tryon-head">
            <h1>{shade}</h1>
            {product && (
              <button
                className="icon"
                aria-pressed={saved}
                aria-label={saved ? "Remove from saved" : "Save"}
                onClick={() => toggleSaved({ id: product.id, title: product.title, brand: product.brand, image: product.photos[0] ?? product.image, priceFrom: product.priceFrom })}
              >
                <HeartIcon />
              </button>
            )}
          </div>
          <p className="meta">
            {product?.title}
            {product?.finish && ` · ${titleCase(product.finish)}`}
            {product && ` · from ${euro(product.priceFrom)}`}
            {sample && " · Sample face"}
          </p>
          {fit && (
            <p className="fit">
              {shade === best ? `${fit.percent}% for you${fit.reason ?? fit.warning ? ` · ${fit.reason ?? fit.warning}` : ""}` : `Your best shade here is ${best ?? fit.shade}`}
            </p>
          )}
          <div className="picks" aria-label="Choose a kind of makeup">
            {tabs.map((tab) => (
              <button key={tab.type} aria-pressed={tab.type === type} onClick={() => openTab(tab.type)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="rail" ref={rail} aria-label="Choose a shade">
            {families.map((family) => (
              <Fragment key={family.name}>
                <span className="family">{family.name}</span>
                {family.swatches.map((s) => (
                  <button
                    key={s.productId + s.name}
                    className="swatch"
                    data-best={(s.productId === ranked[0]?.id && s.name === fits?.[s.productId]?.shade) || undefined}
                    style={{ "--c": s.hex } as CSSProperties}
                    aria-pressed={s.productId === product?.id && s.name === shade}
                    aria-label={`${family.name}, ${s.name}`}
                    onClick={() => choose(s)}
                  >
                    <i />
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
          <p className="meta">{busy ? "Applying the shade" : (note ?? "Pick a shade to try it on.")}</p>
          {product && (
            <div className="actions">
              <button className="btn" onClick={() => setBuying(true)}>
                Buy this shade
              </button>
              <button
                className="link"
                onClick={() => {
                  setPhoto(null);
                  setSample(null);
                  setChoosing(true);
                }}
              >
                Change face
              </button>
            </div>
          )}
          {buying && product && <ProductSheet product={product} shade={shade ?? ""} onClose={() => setBuying(false)} canTry={false} />}
        </section>
      )}
    </div>
  );
}
