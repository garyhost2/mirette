"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { basin } from "@/lib/basin";
import type { FeedProduct } from "@/lib/feed";
import { lightIsUneven, prepareSelfie, previewLayers, readFaceOnDevice, type Layer } from "@/lib/preview";
import { setFace, track, useProfile } from "@/lib/profile";
import { GuidedSelfie } from "./GuidedSelfie";

const GROUPS = [
  { id: "lips", label: "Lips" },
  { id: "face", label: "Face" },
  { id: "cheeks", label: "Cheeks" },
  { id: "eyes", label: "Eyes" },
] as const;

type Sample = { id: string; photo: string; skin: string };
type Step = Layer & { productId: string };

export function TryOn({ products, startId, lookId, samples }: { products: FeedProduct[]; startId?: string; lookId?: string; samples: Sample[] }) {
  const first = products.find((p) => p.id === startId) ?? products[0];
  const [group, setGroup] = useState<string>(first?.group ?? "lips");
  const [productId, setProductId] = useState<string | undefined>(first?.id);
  const [picked, setPicked] = useState<string>();
  /** The clean photo every shade is applied to. */
  const [ownPhoto, setPhoto] = useState<string | null>(null);
  const [chosenSample, setSample] = useState<Sample | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [guided, setGuided] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const appliedLook = useRef(false);
  const latest = useRef(0);
  const profile = useProfile();

  // A shopper who already picked a sample face comes straight back to it. Selfies are never stored.
  const remembered = !choosing && profile?.face.source === "sample" ? samples.find((s) => s.skin === profile.face.tone.skin) : undefined;
  const sample = chosenSample ?? remembered ?? null;
  const photo = ownPhoto ?? remembered?.photo ?? null;

  const inGroup = useMemo(() => products.filter((p) => p.group === group), [products, group]);
  const product = products.find((p) => p.id === productId) ?? inGroup[0];
  const fit = product ? profile?.reading?.fits[product.id] : undefined;
  // The engine's best shade leads until the shopper chooses their own.
  const best = product?.shades.find((s) => s.name === fit?.shade)?.name;
  const shade = picked ?? best ?? product?.shades[0]?.name;

  useEffect(() => {
    basin.open(photo ?? samples[0].photo);
  }, [photo, samples]);

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
    const ready = await prepareSelfie(file).catch(() => null);
    if (!ready) {
      setBusy(false);
      setNote("That photo could not be opened. Try a JPEG or PNG.");
      return;
    }
    const url = URL.createObjectURL(ready);
    // Side photos are read on this device and are never sent anywhere.
    const sideUrls = sides.map((s) => URL.createObjectURL(s));
    const body = new FormData();
    body.set("photo", ready);
    const result = await scan(body);
    if ("face" in result) {
      void setFace(result.face, result.fileId);
    } else {
      // With no key, or no units left, the phone reads what it can by itself.
      setBusy(true);
      const local = await readFaceOnDevice(url, sideUrls).catch(() => null);
      setBusy(false);
      if (!local) {
        setNote("No clear face in this photo. Face the light and try again.");
        return;
      }
      void setFace(local);
    }
    const uneven = sideUrls.length ? await lightIsUneven(url, sideUrls).catch(() => false) : false;
    sideUrls.forEach((u) => URL.revokeObjectURL(u));
    setSample(null);
    setPhoto(url);
    setChoosing(false);
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
    void setFace(result.face);
    setSample(chosen);
    setPhoto(chosen.photo);
    setChoosing(false);
  }

  function choose(name: string, hex: string | null) {
    setPicked(name);
    if (!product || !hex) return;
    track("tryon", product.id);
    void wear([{ productId: product.id, type: product.type, hex }]);
  }

  function openProduct(id: string | undefined) {
    setProductId(id);
    setPicked(undefined);
  }

  return (
    <div className="tryon">
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
          <h1>{shade}</h1>
          <p className="meta">
            {product?.title}
            {sample && " · Sample face"}
          </p>
          {fit && (
            <p className="fit">
              {shade === best ? `${fit.percent}% for you${fit.reason ?? fit.warning ? ` · ${fit.reason ?? fit.warning}` : ""}` : `Your best shade here is ${best ?? fit.shade}`}
            </p>
          )}
          <div className="groups">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                aria-pressed={group === g.id}
                onClick={() => {
                  setGroup(g.id);
                  openProduct(products.find((p) => p.group === g.id)?.id);
                }}
              >
                {g.label}
              </button>
            ))}
            <button
              onClick={() => {
                setPhoto(null);
                setSample(null);
                setChoosing(true);
              }}
            >
              Change face
            </button>
          </div>
          <div className="picks" aria-label="Choose a product">
            {inGroup.map((p) => (
              <button key={p.id} aria-pressed={p.id === product?.id} onClick={() => openProduct(p.id)}>
                {p.title}
              </button>
            ))}
          </div>
          {product && (
            <div className="rail" aria-label="Choose a shade">
              {product.shades.map((s) => (
                <button
                  key={s.name}
                  className="swatch"
                  data-best={s.name === best || undefined}
                  style={{ "--c": s.hex ?? undefined } as CSSProperties}
                  aria-pressed={s.name === shade}
                  aria-label={s.name}
                  onClick={() => choose(s.name, s.hex)}
                >
                  <i />
                </button>
              ))}
            </div>
          )}
          <p className="meta">{busy ? "Applying the shade" : (note ?? "Pick a shade to try it on.")}</p>
        </section>
      )}
    </div>
  );
}
