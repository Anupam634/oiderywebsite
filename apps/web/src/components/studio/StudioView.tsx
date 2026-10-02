'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  GARMENTS,
  GC,
  FONTS,
  FONT_KEYS,
  MOTIFS,
  MOTIF_KEYS,
  SAMPLE_NAMES,
  STITCH_FILTER_DEFS,
  TH,
  THREADS,
  TPAL,
  clamp,
  col,
  finalize,
  hexRgb,
  inner,
  isAnalyseError,
  lab,
  nearestThread,
  relLum,
  sceneGeometry,
  setTcol,
  type FontKey,
  type GarmentColour,
  type GarmentView,
  type MotifKey,
  type PlacementKey,
  type PreparedDesign,
  type SampleKind,
  type Scene,
} from '@store/stitch';
import {
  STUDIO_GARMENTS,
  STUDIO_MAX_QTY,
  STUDIO_SIZES,
  STUDIO_TIERS,
  cleanName,
  formatINR,
  hasDevanagari,
  studioPrice,
  type StudioGarment,
  type StudioLineSpec,
  type StudioSize,
} from '@store/shared';
import { fitForUpload } from '@/lib/shrink';
import { api, ApiError } from '@/lib/api';
import { photo } from '@/lib/img';
import { cart, ui } from '@/lib/store';
import { engine, NAME_FONT_CSS } from '@/lib/stitch';
import { analyseOffThread } from '@/lib/stitch-worker';
import { Bag, Chat, Check, ChevronDown, Eye, Info } from '../icons';

type How = 'upload' | 'make';
type Mode = 'front' | 'close';
type Source = HTMLImageElement | HTMLCanvasElement;
const MAX_NAME = 18;
const WA = 'https://wa.me/?text=';

export interface StudioStart {
  garment?: string;
  sample?: string;
  how?: string;
}

const garmentOf = (id: string) => STUDIO_GARMENTS.find((g) => g.id === id) ?? STUDIO_GARMENTS[0]!;
const placesOf = (view: GarmentView) => Object.entries(GARMENTS[view].place) as [PlacementKey, NonNullable<(typeof GARMENTS)[GarmentView]['place'][PlacementKey]>][];
const firstPlace = (view: GarmentView) => placesOf(view)[0]!;
const motifHex = (k: MotifKey) => MOTIFS[k].def.map((t) => col(t)!) as string[];

export function StudioView({ start }: { start: StudioStart }) {
  const g0 = garmentOf(start.garment ?? 'tee');
  const v0 = g0.views[0]![0] as GarmentView;
  /* ---- what's on the garment ---- */
  const [g, setG] = useState<StudioGarment>(g0);
  const [view, setView] = useState<GarmentView>(v0);
  const [colour, setColour] = useState<GarmentColour>(g0.colours[0] as GarmentColour);
  const [place, setPlace] = useState<PlacementKey>(firstPlace(v0)[0]);
  const [size, setSize] = useState(firstPlace(v0)[1].d);
  const [off, setOff] = useState<[number, number]>([0, 0]);
  const [mode, setMode] = useState<Mode>('front');
  /* ---- where the design comes from ---- */
  const [how, setHow] = useState<How>(start.how === 'motif' || start.how === 'name' ? 'make' : 'upload');
  const [src, setSrc] = useState<{ img: Source; file: string; sample: SampleKind | ''; blob?: Blob } | null>(null);
  const [adding, setAdding] = useState(false);
  const [bgOn, setBgOn] = useState(true);
  const [k, setK] = useState<{ n: number; auto: boolean }>({ n: 4, auto: true });
  const [motif, setMotif] = useState<MotifKey | 'none'>(start.how === 'name' ? 'none' : 'gulaab');
  const [mhex, setMhex] = useState<string[]>(motifHex('gulaab'));
  const [text, setText] = useState(start.how === 'name' ? 'Priya' : '');
  const [font, setFont] = useState<FontKey>('script');
  const [thex, setThex] = useState<string>(TH.neel);
  /* ---- the prepared design (mutable: thread edits change it in place, `rev` re-renders) ---- */
  const D = useRef<PreparedDesign | null>(null);
  const [rev, setRev] = useState(0);
  const [label, setLabel] = useState('');
  const [fileWarn, setFileWarn] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  /* ---- how many ---- */
  const [mix, setMix] = useState<Record<StudioSize, number>>({ S: 0, M: 1, L: 0, XL: 0, XXL: 0 });
  const [q, setQ] = useState(1);
  const [pop, setPop] = useState<{ i: number; x: number; y: number } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const bump = () => setRev((r) => r + 1);
  const design = D.current;
  const scene: Scene = useMemo(() => ({ view, col: colour, place, size, off, D: design }), [view, colour, place, size, off, design, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engine.fontsLoaded().then(() => setFontsReady(true));
  }, []);
  // first design: the sample logo from the link (or Chai Co.), unless the link asked for a motif or name
  useEffect(() => {
    if (!fontsReady || how !== 'upload' || src) return;
    const s = (start.sample && start.sample in SAMPLE_NAMES ? start.sample : 'chai') as SampleKind;
    setSrc({ img: engine.sampleLogo(s), file: SAMPLE_NAMES[s], sample: s });
  }, [fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- analyse the upload, or draw the motif + name ---- */
  const job = useRef(0);
  const nameKey = cleanName(text).trim();
  const [debouncedName, setDebouncedName] = useState(nameKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameKey), 220);
    return () => clearTimeout(t);
  }, [nameKey]);
  useEffect(() => {
    const my = ++job.current;
    if (how === 'make') {
      if (!fontsReady) return;
      if (motif === 'none' && !debouncedName) {
        D.current = null;
        setLabel('');
        return bump();
      }
      engine.designFrom({ motif, mcols: mhex, text: debouncedName, font, tcol: thex }).then(({ canvas: c, palette }) => {
        if (my !== job.current) return;
        D.current = engine.analyseKnown(c, palette);
        setLabel([motif !== 'none' ? `${MOTIFS[motif].name} motif` : '', debouncedName ? `“${debouncedName}”` : ''].filter(Boolean).join(' + '));
        bump();
      });
      return;
    }
    if (!src) {
      D.current = null;
      return bump();
    }
    setBusy('Matching your colours to real threads…');
    const t = setTimeout(() => {
      if (my !== job.current) return;
      analyseOffThread(src.img, { bgOn, k: k.n, auto: k.auto }).then((r) => {
        if (my !== job.current) return;
        setBusy(null);
        if (isAnalyseError(r)) return setFileWarn(r.err);
        setFileWarn('');
        D.current = r;
        setLabel(src.file);
        if (k.auto) setK({ n: r.k, auto: true });
        bump();
      });
    }, 40);
    return () => clearTimeout(t);
  }, [how, src, bgOn, k.n, k.auto, motif, mhex, debouncedName, font, thex, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- draw ---- */
  useEffect(() => {
    let raf = 0;
    let live = true;
    const draw = () => {
      const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
      if (ctx) engine.renderTo(scene, ctx, mode);
    };
    if (engine.isGarmentReady(view)) raf = requestAnimationFrame(draw);
    else {
      setBusy('Loading the garment photo…');
      engine.garmentReady(view).then(
        () => live && (setBusy(null), (raf = requestAnimationFrame(draw))),
        () => live && setBusy('Could not load the garment photo. Check your connection.'),
      );
    }
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [scene, mode, view]);

  /* ---- garment choices ---- */
  const pickGarment = (id: string) => {
    const ng = garmentOf(id);
    if (ng.id === g.id) return;
    const nv = ng.views[0]![0] as GarmentView;
    setG(ng);
    setView(nv);
    if (!ng.colours.includes(colour)) setColour(ng.colours[0] as GarmentColour);
    const [pk, P] = firstPlace(nv);
    setPlace(pk);
    setSize(P.d);
    setOff([0, 0]);
  };
  const pickView = (nv: GarmentView) => {
    setView(nv);
    if (!GARMENTS[nv].place[place]) {
      const [pk, P] = firstPlace(nv);
      setPlace(pk);
      setSize(P.d);
    }
    setOff([0, 0]);
  };
  const P = GARMENTS[view].place[place] ?? firstPlace(view)[1];

  /* ---- uploads ---- */
  const loadFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(f.type)) return setFileWarn('Please upload a PNG, JPG, SVG or WEBP image.');
    if (f.size > 10 * 1024 * 1024) return setFileWarn('That file is over 10 MB. Please upload a smaller one.');
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        if (!im.naturalWidth) im.width = im.height = 600;
        setHow('upload');
        setK({ n: 4, auto: true });
        setOff([0, 0]);
        setSrc({ img: im, file: f.name, sample: '', blob: f });
        ui.toast('Your design is on the garment');
      };
      im.onerror = () => setFileWarn('We couldn’t read that image. Try saving it again as a PNG.');
      im.src = r.result as string;
    };
    r.readAsDataURL(f);
  };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea')) return;
      const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (it) loadFile(it.getAsFile());
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  });
  const trySample = (s: SampleKind) => {
    setHow('upload');
    setK({ n: 4, auto: true });
    setOff([0, 0]);
    setSrc({ img: engine.sampleLogo(s), file: SAMPLE_NAMES[s], sample: s });
  };
  const switchHow = (h: How) => {
    if (h === how) return;
    setHow(h);
    setOff([0, 0]);
    if (h === 'make' && !text && motif === 'none') {
      setMotif('gulaab');
      setMhex(motifHex('gulaab'));
    }
  };
  const onName = (v: string) => {
    setText(v);
    if (hasDevanagari(v) && font !== 'hindi') {
      setFont('hindi');
      ui.toast('Switched to the हिंदी font for your Hindi name');
    }
  };

  /* ---- thread edits ---- */
  const pickThread = (i: number, t: number) => {
    const d = D.current;
    setPop(null);
    if (!d) return;
    if (how === 'make') {
      // a known design is redrawn: swap every colour that maps to this thread
      const old = d.threads[i],
        hex = TPAL[t]![1],
        same = (h: string) => nearestThread(lab(...hexRgb(h))) === old;
      setMhex((m) => m.map((h) => (same(h) ? hex : h)));
      if (same(thex)) setThex(hex);
      return;
    }
    d.threads[i] = t;
    d.drop.delete(i);
    finalize(d);
    setTcol(d);
    bump();
  };
  const toggleDrop = (i: number) => {
    const d = D.current;
    if (!d) return;
    if (d.drop.has(i)) d.drop.delete(i);
    else {
      if (d.drop.size >= d.threads.length - 1) return ui.toast('Keep at least one thread colour');
      d.drop.add(i);
    }
    d.autoDrop = false;
    finalize(d);
    setPop(null);
    bump();
  };
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest('.up-pop') && setPop(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null);
    const t = setTimeout(() => document.addEventListener('click', close));
    addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
      removeEventListener('keydown', esc);
    };
  }, [pop]);

  /* ---- drag to move (mouse/pen; on phones the arrows move it so the page can still scroll) ---- */
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hintOff, setHintOff] = useState(false);
  const toPhoto = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 900, y: ((e.clientY - r.top) / r.height) * 1125 };
  };
  const lim = GARMENTS[view].pxcm * 3;
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!design) return;
    if (mode === 'close') return setMode('front');
    if (e.pointerType === 'touch') return;
    const p = toPhoto(e),
      geo = sceneGeometry(scene);
    if (Math.abs(p.x - geo.cx) < geo.wpx * 0.62 + 18 && Math.abs(p.y - geo.cy) < geo.hpx * 0.62 + 18) {
      drag.current = { x: p.x, y: p.y, ox: off[0], oy: off[1] };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      setHintOff(true);
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toPhoto(e);
    setOff([clamp(d.ox + p.x - d.x, -lim, lim), clamp(d.oy + p.y - d.y, -lim, lim)]);
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const nudge = (n: 'l' | 'r' | 'u' | 'd' | 'c') => {
    if (n === 'c') return setOff([0, 0]);
    const s = GARMENTS[view].pxcm * 0.5,
      m = { l: [-s, 0], r: [s, 0], u: [0, -s], d: [0, s] }[n];
    setOff(([x, y]) => [clamp(x + m[0]!, -lim, lim), clamp(y + m[1]!, -lim, lim)]);
  };

  /* ---- price ---- */
  const qty = g.sizes ? STUDIO_SIZES.reduce((a, s) => a + mix[s], 0) : q;
  const stitches = design ? engine.stitchCount(scene) : 0;
  const price = studioPrice(g, Math.max(1, qty), stitches, how === 'upload');
  const total = qty ? price.unitPaise * qty + price.digitizePaise : 0;
  const canAdd = qty > 0 && !!design;

  /** the logo file the studio's digitizer works from: the shopper's own file, or the sample drawn as a PNG */
  const logoBlob = async (): Promise<{ blob: Blob; name: string } | null> => {
    if (how !== 'upload' || !src) return null;
    if (src.blob) return fitForUpload(src.blob, { maxPx: 4000, kind: 'logo', name: src.file });
    const c = src.img as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    return blob ? { blob, name: `${src.sample || 'logo'}.png` } : null;
  };

  const add = async () => {
    if (!design) return ui.toast('Add a design first');
    if (!qty) return ui.toast('Choose how many you need');
    setAdding(true);
    try {
      const shot = engine.snapshot(scene, 'front', 270);
      const thumb = shot.toDataURL('image/jpeg', 0.82);
      // upload now, so the order carries the exact logo and the mockup the shopper approved
      const logo = await logoBlob();
      const preview = await new Promise<Blob | null>((r) => engine.snapshot(scene, 'front', 900).toBlob(r, 'image/jpeg', 0.88));
      const uploads: string[] = [];
      if (logo) uploads.push((await api.upload('logo', logo.blob, logo.name)).id);
      if (preview) uploads.push((await api.upload('preview', preview, 'mockup.jpg')).id);
      const what = how === 'make' ? (debouncedName ? 'your name' : 'a motif') : 'your logo';
      const sizes = g.sizes ? Object.fromEntries(STUDIO_SIZES.filter((s) => mix[s]).map((s) => [s, mix[s]])) : undefined;
      const mixText = g.sizes ? STUDIO_SIZES.filter((s) => mix[s]).map((s) => `${s}×${mix[s]}`).join(', ') : `${qty} pcs`;
      const threads = design.threads.filter((_, i) => !design.drop.has(i)).map((t) => ({ hex: TPAL[t]![1], name: TPAL[t]![0] }));
      const spec: StudioLineSpec = {
        garment: g.id, colour, view, placement: place, widthCm: size, stitches, source: how, label: label || 'design', threads,
        ...(sizes ? { sizes } : {}),
      };
      cart.add({
        key: `studio-${Date.now()}`,
        variantId: `studio:${g.id}`,
        slug: 'studio',
        name: `${g.name} with ${what}`,
        image: thumb,
        qty,
        unitPricePaise: price.unitPaise,
        unitMrpPaise: price.unitMrpPaise,
        extraPaise: price.digitizePaise,
        desc: `${GC[colour][0]} · ${P.n}, ${size} cm · ${label || 'design'} · ${mixText}`,
        custom: true,
        studio: spec,
        uploads,
      });
      ui.open('cart');
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'We couldn’t add it to your bag. Please try again.');
    } finally {
      setAdding(false);
    }
  };
  const quote = () => {
    const threads = design ? design.threads.map((t) => TPAL[t]![0]).join(', ') : '';
    const msg = `Hi! I’d like a quote for ${g.name} in ${GC[colour][0]} · ${P.n}, ${size} cm · ${qty} pcs${threads ? ` · threads: ${threads}` : ''}. Design: ${label || 'my logo'}.`;
    window.open(WA + encodeURIComponent(msg), '_blank', 'noopener');
  };
  const download = () => {
    if (!design) return ui.toast('Add a design first');
    engine.snapshot(scene, mode).toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b),
        l = document.createElement('a');
      l.href = url;
      l.download = `mockup-${g.id}-${colour}.png`;
      document.body.appendChild(l);
      l.click();
      l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ui.toast('Mockup downloaded');
    }, 'image/png');
  };

  /* ---- advice under the threads ---- */
  const warnings = useMemo(() => {
    const d = design;
    if (!d) return [];
    const w: string[] = [];
    const c0 = d.count0.reduce((a, b) => a + b, 0) || 1;
    if (d.autoDrop) w.push('We left out a colour that matched your background, like the space inside letters. Tap a thread to change this.');
    if (d.photoLike) w.push(`Your image has lots of shades, like a photo. Thread comes in solid colours, so we’ve simplified it to ${d.threads.length}.`);
    if (how === 'upload' && Math.min(d.srcW, d.srcH) < 250) w.push(`Your file is quite small (${d.srcW}×${d.srcH} px). A bigger file helps our digitizer.`);
    const dye = GC[colour][1];
    const gl = dye ? relLum(dye) : colour === 'natural' ? 0.62 : 0.86;
    if (d.threads.some((t, i) => !d.drop.has(i) && d.count0[i]! / c0 > 0.2 && Math.abs(relLum(TPAL[t]![1]) - gl) < 0.07))
      w.push('A main thread colour is very close to the garment colour, so it won’t stand out. Try another thread or garment colour.');
    if (size < 6) w.push('At this size, text smaller than 5 mm may be simplified by our digitizer.');
    return w;
  }, [design, rev, how, colour, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const threadsUsed = design ? design.threads.length - design.drop.size : 0;
  const c0 = design ? design.count0.reduce((a, b) => a + b, 0) || 1 : 1;
  const hcm = design ? Math.round(((size * design.h) / design.w) * 10) / 10 : 0;
  const tn = THREADS.find(([key]) => TH[key] === thex);
  const fileTag = label.length > 30 ? label.slice(0, 28) + '…' : label;
  const addLabel = qty ? `Add ${qty} to bag · ${formatINR(total)}` : 'Choose a quantity';

  const onDrop = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('over');
    loadFile(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs dangerouslySetInnerHTML={{ __html: STITCH_FILTER_DEFS }} /></svg>
      <section className="wrap up-studio">
        <div className="up-left">
          <div className="up-stage">
            <div className="up-bar">
              <div className="seg" role="group" aria-label="View">
                <button type="button" aria-pressed={mode === 'front'} onClick={() => setMode('front')}>Full view</button>
                <button type="button" aria-pressed={mode === 'close'} onClick={() => setMode('close')}>Stitch close-up</button>
              </div>
              {g.views.length > 1 && (
                <div className="seg" role="group" aria-label="Angle">
                  {g.views.map(([v, n]) => <button key={v} type="button" aria-pressed={v === view} onClick={() => pickView(v as GarmentView)}>{n}</button>)}
                </div>
              )}
            </div>
            <div className={`up-cwrap${mode === 'close' ? ' is-close' : ''}${dragging ? ' dragging' : ''}`}>
              <canvas ref={canvas} id="mock" width={900} height={1125} role="img" aria-label="Mockup of your design on the garment" data-rev={rev}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              <div className="up-busy" hidden={!busy}><span className="up-spin" /><span>{busy}</span></div>
              <div className={`up-hint${hintOff ? ' off' : ''}`} hidden={mode === 'close' || !design}>Drag your design to move it</div>
            </div>
            <div className="up-foot">
              <span className="up-real"><Eye />Real garment photo · your design follows its folds and light</span>
              <button className="pill" type="button" onClick={download}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Download mockup
              </button>
            </div>
          </div>
          <div className="up-garments" role="group" aria-label="Choose a garment">
            {STUDIO_GARMENTS.map((x) => (
              <button key={x.id} type="button" className="up-g" aria-pressed={x.id === g.id} onClick={() => pickGarment(x.id)}>
                <img {...photo(engine.garmentUrls(x.views[0]![0] as GarmentView).photo, '', { sizes: '(max-width: 760px) 30vw, 140px', width: 900, height: 1125, eager: true })} /><span>{x.name}</span><small>from {formatINR(x.pricePaise)}</small>
              </button>
            ))}
          </div>
          <div className="up-colours">
            <div className="up-label">Garment colour: <b>{GC[colour][0]}</b></div>
            <div className="up-sws" role="group" aria-label="Garment colour">
              {g.colours.map((c) => {
                const [n, hex] = GC[c as GarmentColour];
                return <button key={c} type="button" className={`up-sw${hex ? '' : ' photo'}`} style={{ ['--c' as string]: hex ?? '#fff' }} aria-pressed={c === colour} aria-label={n} title={n} onClick={() => setColour(c as GarmentColour)} />;
              })}
            </div>
          </div>
          <p className="up-credit">
            Demo garment photo from <a href={GARMENTS[view].credit} target="_blank" rel="noopener">Unsplash</a>. Replace with your own product photos before launch.
          </p>
        </div>

        <div className="up-right">
          <div className="up-panel">
            <div className="step">
              <h2><span>1</span>Your design<small>{fileTag}</small></h2>
              <div className="seg up-modes" role="tablist" aria-label="How do you want to start?">
                <button type="button" role="tab" aria-selected={how === 'upload'} onClick={() => switchHow('upload')}>Upload a logo</button>
                <button type="button" role="tab" aria-selected={how === 'make'} onClick={() => switchHow('make')}>Motif &amp; name</button>
              </div>
              {how === 'upload' ? (
                <div>
                  <label className="up-drop" onDragEnter={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragOver={(e) => e.preventDefault()}
                    onDragLeave={(e) => e.currentTarget.classList.remove('over')} onDrop={onDrop}>
                    <input type="file" id="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
                    <span className="up-dropic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V5M7 10l5-5 5 5" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg></span>
                    <b>Drop your logo here, or tap to choose</b>
                    <small>PNG, JPG, SVG or WEBP · up to 10 MB · you can also paste an image</small>
                  </label>
                  <div className="up-samples">
                    <span>No logo handy? Try one:</span>
                    {(Object.keys(SAMPLE_NAMES) as SampleKind[]).map((s) => (
                      <button key={s} type="button" aria-pressed={src?.sample === s} onClick={() => trySample(s)}>{SAMPLE_NAMES[s].replace(' (sample)', '')}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="up-label">Motif</div>
                  <div className="up-motifs" role="group" aria-label="Choose a motif">
                    {MOTIF_KEYS.map((m) => (
                      <button key={m} type="button" className="up-motif" aria-pressed={motif === m} onClick={() => { setMotif(m); setMhex(motifHex(m)); }}>
                        <svg viewBox="-62 -62 124 124" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner(MOTIFS[m].draw(motifHex(m))) }} />
                        {MOTIFS[m].name}
                      </button>
                    ))}
                    <button type="button" className="up-motif" aria-pressed={motif === 'none'} onClick={() => setMotif('none')}><span className="none">Name only</span>No motif</button>
                  </div>
                  <div className="up-label" style={{ marginTop: 14 }}>Name or initials <small className="mut">{[...text].length}/{MAX_NAME}</small></div>
                  <label className="field"><input id="nameIn" type="text" maxLength={MAX_NAME} autoComplete="off" placeholder="Type a name, e.g. Priya" aria-label="Name to embroider" value={text} onChange={(e) => onName(e.target.value)} /></label>
                  <div className="fonts">
                    {FONT_KEYS.map((fk) => (
                      <button key={fk} type="button" className="fbtn" aria-pressed={font === fk} onClick={() => setFont(fk)}>
                        <b style={{ fontFamily: NAME_FONT_CSS[fk], fontStyle: FONTS[fk].it ? 'italic' : undefined, fontWeight: FONTS[fk].w, fontSize: fk === 'bold' ? 17 : undefined }}>{FONTS[fk].lbl}</b>
                        <small>{FONTS[fk].name}</small>
                      </button>
                    ))}
                  </div>
                  <div className="up-label" style={{ marginTop: 12 }}>Name thread: <b>{tn ? tn[1] : 'Custom'}</b></div>
                  <div className="up-tcols" role="group" aria-label="Name thread colour">
                    {THREADS.map(([key, n]) => <button key={key} type="button" style={{ ['--c' as string]: TH[key] }} aria-label={`${n} thread`} title={n} aria-pressed={TH[key] === thex} onClick={() => setThex(TH[key])} />)}
                  </div>
                </div>
              )}
              <div className={`warn${fileWarn ? ' show' : ''}`}>{fileWarn}</div>
            </div>

            <div className="step">
              <h2><span>2</span>Thread colours<small>{design ? `${threadsUsed} thread colour${threadsUsed > 1 ? 's' : ''}` : ''}</small></h2>
              <div className="up-threads">
                {design ? (
                  design.threads.map((t, i) => {
                    const dropped = design.drop.has(i);
                    return (
                      <button key={i} type="button" className="up-th" data-dropped={dropped} style={{ ['--c' as string]: TPAL[t]![1] }}
                        aria-label={`Thread ${i + 1}: ${TPAL[t]![0]} ${dropped ? 'not stitched' : `${Math.round((design.count0[i]! / c0) * 100)}%`}. Change`}
                        onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPop({ i, x: clamp(r.left + scrollX, 8, scrollX + innerWidth - 300), y: r.bottom + scrollY + 8 }); }}>
                        <i />{TPAL[t]![0]}{' '}<small>{dropped ? 'not stitched' : `${Math.round((design.count0[i]! / c0) * 100)}%`}</small><ChevronDown strokeWidth={2.4} />
                      </button>
                    );
                  })
                ) : (
                  <span className="mut">{how === 'make' ? 'Pick a motif or type a name to see its threads.' : 'Upload a design to see its thread colours.'}</span>
                )}
              </div>
              {how === 'upload' && (
                <div className="up-row">
                  <label className="up-switch"><input type="checkbox" checked={design?.hasAlpha ? true : bgOn} disabled={!!design?.hasAlpha} onChange={(e) => setBgOn(e.target.checked)} /><span>{design?.hasAlpha ? 'Transparent background found' : 'Remove background'}</span></label>
                  <div className="up-range"><span>Max colours <b>{k.n}</b></span><input type="range" min={1} max={6} step={1} value={k.n} aria-label="Maximum thread colours" onChange={(e) => setK({ n: +e.target.value, auto: false })} /></div>
                </div>
              )}
              <div className={`warn${warnings.length ? ' show' : ''}`}>{warnings.map((w) => <div key={w}>{w}</div>)}</div>
            </div>

            <div className="step">
              <h2><span>3</span>Placement &amp; size</h2>
              <div className="seg up-places" role="group" aria-label="Placement">
                {placesOf(view).map(([pk, pl]) => (
                  <button key={pk} type="button" aria-pressed={pk === place} onClick={() => { setPlace(pk); setSize(pl.d); setOff([0, 0]); }}>{pl.n}</button>
                ))}
              </div>
              <div className="up-range wide"><span>Width <b>{size} cm</b></span><input type="range" min={P.min} max={P.max} step={0.5} value={size} aria-label="Design width in cm" onChange={(e) => setSize(+e.target.value)} /></div>
              <div className="up-nudge" role="group" aria-label="Move the design">
                <span>Move</span>
                <button type="button" aria-label="Move left" onClick={() => nudge('l')}>←</button>
                <button type="button" aria-label="Move right" onClick={() => nudge('r')}>→</button>
                <button type="button" aria-label="Move up" onClick={() => nudge('u')}>↑</button>
                <button type="button" aria-label="Move down" onClick={() => nudge('d')}>↓</button>
                <button type="button" onClick={() => nudge('c')}>Centre</button>
              </div>
              <div className="up-stats">
                <div><small>Stitches</small><b>{design ? stitches.toLocaleString('en-IN') : '—'}</b></div>
                <div><small>Size</small><b>{design ? `${size}×${hcm} cm` : '—'}</b></div>
                <div><small>Colours</small><b>{design ? `${threadsUsed} / 6` : '—'}</b></div>
              </div>
            </div>

            <div className="step">
              <h2><span>4</span>How many?<small>{qty} piece{qty === 1 ? '' : 's'}</small></h2>
              <div className="up-mix">
                {g.sizes ? (
                  STUDIO_SIZES.map((s) => (
                    <Qty key={s} label={s} value={mix[s]} min={0} onChange={(v) => setMix((m) => ({ ...m, [s]: v }))} />
                  ))
                ) : (
                  <Qty label="Quantity" value={q} min={1} onChange={setQ} />
                )}
              </div>
              <div className="up-tiers">
                {STUDIO_TIERS.map((t) => {
                  const p = studioPrice(g, t.min, stitches, false);
                  return (
                    <div key={t.min} className={`up-tier${t === price.tier ? ' on' : ''}`}>
                      <small>{Number.isFinite(t.max) ? `${t.min}–${t.max}` : `${t.min}+`} pcs</small>
                      <b>{formatINR(p.unitPaise)}</b>
                      <em>{t.off ? `${Math.round(t.off * 100)}% off` : 'each'}</em>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sum">
              <div className="lines">
                <div><span>{g.name} × {qty}</span><span>{formatINR(price.garmentPaise * qty)}</span></div>
                <div><span>Embroidery × {qty}{design ? ` · ${stitches.toLocaleString('en-IN')} stitches` : ''}</span><span>{formatINR(price.embroideryPaise * qty)}</span></div>
                {how === 'upload' && <div><span>{price.digitizePaise ? 'Logo digitizing (one-time)' : 'Logo digitizing · free on 25+'}</span><span>{price.digitizePaise ? formatINR(price.digitizePaise) : 'Free'}</span></div>}
              </div>
              <div className="total"><span>Total <small className="mut">incl. of all taxes</small></span><b>{formatINR(total)}</b></div>
              <button className="btn btn-grad" type="button" style={{ width: '100%' }} disabled={!canAdd || adding} onClick={() => void add()}>{adding ? <span className="spin" /> : <Bag />}<span>{adding ? 'Adding your design…' : addLabel}</span></button>
              <div className="alt"><button className="pill" type="button" onClick={quote}><Chat />Bulk quote on WhatsApp</button></div>
              <ul className="notes">
                <li><Check strokeWidth={2.4} />Our digitizer redraws your logo as a stitch file and WhatsApps you a proof within 24 hours</li>
                <li><Check strokeWidth={2.4} />Physical sample before bulk orders of 25 or more</li>
                <li className="i"><Info />Only upload designs you own or have permission to use</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {pop && design && (
        <div className="up-pop" role="dialog" aria-label="Choose a thread colour" style={{ left: pop.x, top: pop.y }}>
          <h3>Thread {pop.i + 1} · pick a colour</h3>
          {how === 'upload' && (
            <button type="button" className="up-drop-t" onClick={() => toggleDrop(pop.i)}>{design.drop.has(pop.i) ? 'Stitch this colour again' : 'Don’t stitch this colour (show the fabric)'}</button>
          )}
          <div className="grid6">
            {TPAL.map(([n, h], t) => (
              <button key={n} type="button" style={{ ['--c' as string]: h }} aria-pressed={t === design.threads[pop.i]} onClick={() => pickThread(pop.i, t)}><i />{n}</button>
            ))}
          </div>
        </div>
      )}
      <div className="up-mbar">
        <div><small>Total</small><b>{formatINR(total)}</b></div>
        <button className="btn btn-grad" type="button" disabled={!canAdd || adding} onClick={() => void add()}>{adding ? 'Adding…' : 'Add to bag'}</button>
      </div>
    </>
  );
}

function Qty({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(clamp(Number.isFinite(v) ? v : min, min, STUDIO_MAX_QTY));
  return (
    <div className="up-q">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={`One less ${label}`} onClick={() => set(value - 1)}>−</button>
        <input type="number" min={min} max={STUDIO_MAX_QTY} value={value} aria-label={`Quantity ${label}`} onChange={(e) => set(parseInt(e.target.value || '0', 10))} />
        <button type="button" aria-label={`One more ${label}`} onClick={() => set(value + 1)}>+</button>
      </div>
    </div>
  );
}
