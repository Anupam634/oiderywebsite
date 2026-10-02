'use client';
import {
  analysePixels,
  pixels,
  prepareGarment,
  type AnalyseError,
  type AnalyseOptions,
  type DesignSource,
  type GarmentPixels,
  type PreparedDesign,
} from '@store/stitch';
import type { StitchJob } from './stitch.worker';

/* Sends the engine's heavy steps to stitch.worker.ts. Results are the same objects the engine makes on the main
   thread; if workers are unavailable or the worker fails, the step runs here instead. */

type Waiter = { resolve: (r: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, Waiter>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./stitch.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error !== undefined) w.reject(new Error(e.data.error));
      else w.resolve(e.data.result);
    };
    worker.onerror = () => {
      // could not start (or crashed): answer the waiting jobs here and stop using it
      worker?.terminate();
      worker = null;
      for (const [id, w] of waiting) {
        waiting.delete(id);
        w.reject(new Error('stitch worker failed'));
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** runs a job in the worker; `fallback` runs it on this thread if the worker is missing or fails */
function run<T>(job: StitchJob, transfer: Transferable[], fallback: () => T): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve: resolve as (r: unknown) => void, reject });
    w.postMessage({ id, job }, transfer);
  }).catch(fallback);
}

/** engine.analyse(), off the main thread */
export function analyseOffThread(src: DesignSource, opts: AnalyseOptions): Promise<PreparedDesign | AnalyseError> {
  const px = pixels(src);
  return run({ kind: 'analyse', px, opts }, [], () => analysePixels(px, opts));
}

/** prepareGarment(), off the main thread (passed to createStitchEngine) */
export function prepareGarmentOffThread(px: Uint8ClampedArray, mask: Uint8ClampedArray, w: number, h: number): Promise<GarmentPixels> {
  return run({ kind: 'garment', px, mask, w, h }, [], () => prepareGarment(px, mask, w, h));
}
