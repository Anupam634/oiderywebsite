'use client';

/* Big phone photos are made smaller in the browser before they upload: quicker on mobile data, and well
   under hosting request limits. Anything the browser can't read goes up as it is. */
export async function shrinkImage(file: File, maxPx = 2000, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((done) => c.toBlob((b) => done(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}
