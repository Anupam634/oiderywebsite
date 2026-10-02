import sharp from 'sharp';
import type { Config } from '../../config.ts';
import { hmacHex, randomToken, safeEqual, sha256 } from '../../lib/crypto.ts';
import { AppError } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Upload, UploadKind } from '../../generated/prisma/client.ts';
import type { Storage } from './storage.ts';

/* Uploads: every image is decoded and re-encoded (auto-rotated, metadata such as GPS location removed,
   size capped), so what we store is always a clean image. Private files are served through short-lived
   signed links; public files (product photos) from the bucket or /v1/media. */

interface ImageRule {
  maxBytes: number;
  maxPx: number;
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
}
export const IMAGE_RULES: Partial<Record<UploadKind, ImageRule>> = {
  LOGO: { maxBytes: 10 << 20, maxPx: 4000, format: 'png' },
  PET_PHOTO: { maxBytes: 15 << 20, maxPx: 3000, format: 'jpeg', quality: 90 },
  PREVIEW: { maxBytes: 2 << 20, maxPx: 1400, format: 'jpeg', quality: 85 },
  PROOF: { maxBytes: 20 << 20, maxPx: 2400, format: 'jpeg', quality: 90 },
  PRODUCT_IMAGE: { maxBytes: 25 << 20, maxPx: 2400, format: 'webp', quality: 86 },
  STITCH_PREVIEW: { maxBytes: 10 << 20, maxPx: 2000, format: 'png' },
  RETURN_PHOTO: { maxBytes: 15 << 20, maxPx: 2000, format: 'jpeg', quality: 85 },
};
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;

export interface Processed {
  data: Buffer;
  mime: string;
  ext: string;
  width: number | null;
  height: number | null;
}

const looksLikeSvg = (buf: Buffer) => {
  const head = buf.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  return (head.startsWith('<svg') || head.startsWith('<?xml')) && head.includes('<svg');
};

export class Files {
  constructor(
    private db: Db,
    readonly storage: Storage,
    private config: Config,
  ) {}

  /** clean re-encode of an image; SVG logos are kept as they are (only ever downloaded, never shown inline) */
  async processImage(buf: Buffer, kind: UploadKind, opts: { maxPx?: number; format?: 'png' | 'jpeg' | 'webp' } = {}): Promise<Processed> {
    const rule = IMAGE_RULES[kind];
    if (!rule) throw new Error(`no image rule for ${kind}`);
    if (buf.length > rule.maxBytes) throw new AppError(413, 'file_too_big', `That file is over ${Math.round(rule.maxBytes / 1048576)} MB`);
    if (kind === 'LOGO' && looksLikeSvg(buf)) {
      if (buf.length > 2 << 20) throw new AppError(413, 'file_too_big', 'SVG files can be up to 2 MB');
      return { data: buf, mime: 'image/svg+xml', ext: 'svg', width: null, height: null };
    }
    const format = opts.format ?? rule.format;
    const maxPx = opts.maxPx ?? rule.maxPx;
    try {
      const img = sharp(buf, { limitInputPixels: 80_000_000, failOn: 'error' }).rotate().resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true });
      const out =
        format === 'png' ? img.png({ compressionLevel: 9 }) : format === 'webp' ? img.webp({ quality: rule.quality ?? 86 }) : img.flatten({ background: '#ffffff' }).jpeg({ quality: rule.quality ?? 88, mozjpeg: true });
      const { data, info } = await out.toBuffer({ resolveWithObject: true });
      return { data, mime: MIME[format], ext: EXT[format], width: info.width, height: info.height };
    } catch {
      throw new AppError(400, 'not_an_image', 'We couldn’t read that image. Please upload a PNG, JPG or WEBP file.');
    }
  }

  /** store bytes and record the upload */
  async save(
    kind: UploadKind,
    p: Processed,
    meta: { originalName?: string | null; customerId?: string | null; isPublic?: boolean; orderItemId?: string | null } = {},
  ): Promise<Upload> {
    const now = new Date();
    const key = `${meta.isPublic ? 'public' : 'private'}/${kind.toLowerCase().replace('_', '-')}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomToken(12)}.${p.ext}`;
    await this.storage.put(key, p.data, p.mime);
    return this.db.upload.create({
      data: {
        kind,
        key,
        mime: p.mime,
        bytes: p.data.length,
        width: p.width,
        height: p.height,
        originalName: meta.originalName?.slice(0, 200) ?? null,
        sha256: sha256(p.data),
        isPublic: !!meta.isPublic,
        customerId: meta.customerId ?? null,
        orderItemId: meta.orderItemId ?? null,
        attachedAt: meta.orderItemId ? now : null,
      },
    });
  }

  /** store a non-image file as it is (stitch files, invoices) */
  saveRaw(kind: UploadKind, data: Buffer, mime: string, ext: string, meta: Parameters<Files['save']>[2] = {}) {
    return this.save(kind, { data, mime, ext, width: null, height: null }, meta);
  }

  /**
   * A link to a private file that works for `days` (rounded up to the next midnight UTC, so the same link
   * repeats for a day and browsers can cache it). Relative to the API: /v1/files/<id>?exp=…&sig=…
   */
  signedPath(id: string, days = 3): string {
    const exp = Math.ceil((Date.now() + days * 86_400_000) / 86_400_000) * 86_400;
    return `/v1/files/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  private sign = (id: string, exp: number) => hmacHex(this.config.FILE_SIGNING_SECRET, `file:${id}:${exp}`).slice(0, 32);

  checkSignature(id: string, exp: number, sig: string) {
    return exp * 1000 > Date.now() && safeEqual(this.sign(id, exp), sig);
  }

  /** where a public file can be fetched (bucket URL, or the API's /v1/media route) */
  publicPath(key: string) {
    return this.storage.publicUrl(key) ?? `/v1/media/${key}`;
  }

  read(u: Pick<Upload, 'key'>) {
    return this.storage.get(u.key);
  }

  async remove(u: Pick<Upload, 'id' | 'key'>) {
    await this.storage.delete(u.key);
    await this.db.upload.delete({ where: { id: u.id } }).catch(() => undefined);
  }
}
