'use client';

import { UPLOAD_MAX_BYTES } from './upload-limit';

/* Files are made to fit before they upload: every upload must stay under UPLOAD_MAX_BYTES (see
   upload-limit.ts), and big phone photos are much quicker to send once resized. Logos stay PNG
   (transparency matters to the digitizer); photos become JPEG unless they have see-through parts. */

type Fit = { maxPx: number; kind: 'photo' | 'logo'; name?: string };

export async function fitForUpload(file: Blob, { maxPx, kind, name }: Fit): Promise<{ blob: Blob; name: string }> {
  const original = name ?? (file instanceof File ? file.name : 'upload');
  const base = original.replace(/\.[^.]+$/, '') || 'upload';
  if (file.type === 'image/svg+xml') return { blob: file, name: original }; // vector: small, and the size check still applies
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { blob: file, name: original }; // not an image the browser can read: send as it is
  }
  try {
    const longest = Math.max(bmp.width, bmp.height);
    // already fits: keep the exact file (logos and proofs lose nothing; small photos aren't worth re-encoding)
    if (longest <= maxPx && file.size <= (kind === 'logo' ? UPLOAD_MAX_BYTES : 1_500_000)) return { blob: file, name: original };
    const png = kind === 'logo' || (file.type !== 'image/jpeg' && hasSeeThrough(bmp));
    let px = Math.min(maxPx, longest);
    let quality = 0.88;
    for (let i = 0; i < 6; i++) {
      const blob = await encode(bmp, px / longest, png ? 'image/png' : 'image/jpeg', quality);
      if (blob && blob.size <= UPLOAD_MAX_BYTES) return { blob, name: `${base}.${png ? 'png' : 'jpg'}` };
      px = Math.round(px * 0.8);
      quality = Math.max(0.72, quality - 0.05);
    }
    return { blob: file, name: original }; // still too big: the size check explains
  } finally {
    bmp.close();
  }
}

function encode(bmp: ImageBitmap, k: number, type: 'image/png' | 'image/jpeg', quality: number): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d')!;
  if (type === 'image/jpeg') {
    g.fillStyle = '#fff'; // JPEG has no transparency: never let it turn black
    g.fillRect(0, 0, c.width, c.height);
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((done) => c.toBlob(done, type, quality));
}

/** does the picture have see-through pixels? (checked on a small copy) */
function hasSeeThrough(bmp: ImageBitmap): boolean {
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const a = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < a.length; i += 4) if (a[i]! < 250) return true;
  return false;
}
