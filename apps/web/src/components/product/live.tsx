'use client';
import { useEffect, useRef, useState, type CanvasHTMLAttributes } from 'react';
import { FLOWER_PRESETS, type LivePreviewConfig } from '@store/shared';
import type { DesignSpec, FontKey, GarmentColour, GarmentView, PlacementKey, Scene } from '@store/stitch';
import { engine } from '@/lib/stitch';

export interface LiveInput {
  colour: string;
  palette: number;
  text: string;
  font: string;
  thread: string;
}

function spec(cfg: LivePreviewConfig, i: LiveInput, flowers: boolean): DesignSpec {
  return {
    motif: cfg.motif as DesignSpec['motif'],
    mcols: flowers ? [...FLOWER_PRESETS[i.palette]!.threads] : cfg.motifColours ?? undefined,
    ...(i.text ? { text: i.text, font: i.font as FontKey, tcol: i.thread } : {}),
    ...(cfg.maxTextWidth ? { maxW: cfg.maxTextWidth } : {}),
  };
}

export function buildScene(cfg: LivePreviewConfig, i: LiveInput, flowers: boolean): Promise<Scene> {
  return engine.buildScene({
    view: cfg.view as GarmentView,
    col: i.colour as GarmentColour,
    place: cfg.place as PlacementKey,
    box: cfg.box,
    design: spec(cfg, i, flowers),
  });
}

/** Renders the customer's design onto the garment photo (front + close-up), debounced; newest input wins. */
export function useLivePreview(cfg: LivePreviewConfig | null, input: LiveInput, flowers: boolean) {
  const [out, setOut] = useState<{ front: HTMLCanvasElement | null; close: HTMLCanvasElement | null; version: number }>({ front: null, close: null, version: 0 });
  const [busy, setBusy] = useState(false);
  const job = useRef(0);
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!cfg) return;
    const my = ++job.current;
    const slow = setTimeout(() => setBusy(true), 180);
    const t = setTimeout(async () => {
      try {
        await engine.fontsLoaded();
        const scene = await buildScene(cfg, input, flowers);
        if (my !== job.current) return;
        const front = engine.snapshot(scene, 'front');
        await new Promise((r) => setTimeout(r, 16));
        if (my !== job.current) return;
        const close = engine.snapshot(scene, 'close', undefined, cfg.closeCrop);
        setOut((o) => ({ front, close, version: o.version + 1 }));
      } catch (e) {
        console.error('live preview failed', e);
      } finally {
        if (my === job.current) {
          clearTimeout(slow);
          setBusy(false);
        }
      }
    }, out.version ? 200 : 0);
    return () => {
      clearTimeout(t);
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, key, flowers]);
  return { ...out, busy };
}

/** A canvas that mirrors a rendered source canvas (or shows a fallback photo until the first render). */
export function LiveCanvas({ src, fallback, width = 900, height = 1125, ...rest }: { src: HTMLCanvasElement | null; fallback: string; width?: number; height?: number } & CanvasHTMLAttributes<HTMLCanvasElement>) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    if (src) {
      x.drawImage(src, 0, 0, c.width, c.height);
      return;
    }
    const im = new Image();
    im.onload = () => !src && x.drawImage(im, 0, 0, c.width, c.height);
    im.src = fallback;
  }, [src, fallback]);
  return <canvas ref={ref} width={width} height={height} aria-hidden="true" {...rest} />;
}

/** Small JPEG of a rendered canvas, for bag thumbnails and review photos. */
export function thumbOf(src: HTMLCanvasElement, w = 200): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(w * 1.25);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

/** Review photos for live products: each reviewer's version, rendered one after another when idle. */
export function useVariantRenders(cfg: LivePreviewConfig | null, inputs: (LiveInput | null)[], flowers: boolean) {
  const [shots, setShots] = useState<Record<number, string>>({});
  const key = JSON.stringify(inputs);
  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    (async () => {
      await engine.fontsLoaded();
      for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i];
        if (!alive || !inp) continue;
        await new Promise((r) => setTimeout(r, 120));
        try {
          const scene = await buildScene(cfg, inp, flowers);
          if (!alive) return;
          const url = thumbOf(engine.snapshot(scene, 'front'), 360);
          setShots((s) => ({ ...s, [i]: url }));
        } catch {
          /* keep the fallback photo */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, key, flowers]);
  return shots;
}
