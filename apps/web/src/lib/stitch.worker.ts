import { analysePixels, prepareGarment, type AnalyseOptions, type PixelData } from '@store/stitch';

/* The stitch engine's heavy maths, off the main thread: colour analysis of an uploaded logo, and turning a garment
   photo into the maps the renderer needs. On a phone each takes up to a second; the page stays tappable meanwhile. */

export type StitchJob =
  | { kind: 'analyse'; px: PixelData; opts: AnalyseOptions }
  | { kind: 'garment'; px: Uint8ClampedArray; mask: Uint8ClampedArray; w: number; h: number };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; job: StitchJob }>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const result = job.kind === 'analyse' ? analysePixels(job.px, job.opts) : prepareGarment(job.px, job.mask, job.w, job.h);
    scope.postMessage({ id, result });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
