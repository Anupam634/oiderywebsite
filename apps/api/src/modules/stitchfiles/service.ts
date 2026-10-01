import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { THREAD_LABEL, type StitchThread, type ThreadKey } from '@store/shared';
import type { Config } from '../../config.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { fromApiRoot } from '../../lib/paths.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Files } from '../files/service.ts';

/* Machine files from the digitizer (PES, DST, JEF, EXP…). tools/stitchfile.py (pyembroidery) reads them,
   draws a preview and writes a PES for the Brother machine with the order's thread colours. */

const TOOL = fromApiRoot('tools', 'stitchfile.py');
export const STITCH_FORMATS = ['pes', 'dst', 'jef', 'exp', 'vp3', 'xxx', 'pec', 'u01', 'tbf'];
const THREAD_HEX: Record<string, string> = {
  rani: '#E4007C', gulaab: '#FF78B4', sindoor: '#FF4B2B', kesar: '#FF8A00', haldi: '#FFB300', mehendi: '#5DAA3A',
  mor: '#00A39A', neel: '#3D2BD6', jamun: '#7B2CBF', chandi: '#C9CCD3', moti: '#F4F1EA', kajal: '#1D1B21',
};

interface ToolResult {
  stitches: number;
  colourChanges: number;
  widthMm: number;
  heightMm: number;
  threads: StitchThread[];
  error?: string;
}

export class StitchFiles {
  constructor(
    private db: Db,
    private files: Files,
    private config: Config,
  ) {}

  private run(input: string, outDir: string, threads: { hex: string; name: string }[]): Promise<ToolResult> {
    const args = [TOOL, input, outDir];
    if (threads.length) args.push('--threads', threads.map((t) => t.hex).join(','), '--names', threads.map((t) => t.name.replace(/,/g, ' ')).join(','));
    const pythonPath = [path.resolve(this.config.STITCH_PYTHONPATH), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    return new Promise((resolve, reject) => {
      execFile(this.config.PYTHON_BIN, args, { timeout: 60_000, maxBuffer: 1 << 20, env: { ...process.env, PYTHONPATH: pythonPath } }, (err, stdout, stderr) => {
        const line = stdout.trim().split('\n').at(-1) ?? '';
        try {
          const json = JSON.parse(line) as ToolResult;
          if (json.error) return reject(new AppError(400, 'stitch_file_unreadable', json.error));
          return resolve(json);
        } catch {
          return reject(new Error(`stitch tool failed: ${err?.message ?? ''} ${stderr.slice(0, 400)}`));
        }
      });
    });
  }

  /** the thread colours the shopper chose for this piece, in sewing order (best guess for colourless files) */
  private async threadsFor(orderItemId: string): Promise<{ hex: string; name: string }[]> {
    const item = await this.db.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item) return [];
    const studio = item.studio as { threads?: { hex: string; name: string }[] } | null;
    if (studio?.threads?.length) return studio.threads;
    const p = item.personalisation as { thread?: string } | null;
    if (p?.thread && THREAD_HEX[p.thread]) return [{ hex: THREAD_HEX[p.thread]!, name: THREAD_LABEL[p.thread as ThreadKey] ?? p.thread }];
    return [];
  }

  /** store a digitizer's file for an order item: original + PES for the machine + preview */
  async addToItem(orderItemId: string, data: Buffer, filename: string, label: string, adminId: string) {
    const item = await this.db.orderItem.findUnique({ where: { id: orderItemId }, include: { order: { select: { customerId: true } } } });
    if (!item) throw notFound('Item');
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    if (!STITCH_FORMATS.includes(ext)) throw new AppError(400, 'bad_format', `Upload a machine file (${STITCH_FORMATS.join(', ').toUpperCase()})`);
    if (data.length > 15 << 20) throw new AppError(413, 'file_too_big', 'Machine files can be up to 15 MB');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-'));
    try {
      const input = path.join(dir, `source.${ext}`);
      await fs.writeFile(input, data);
      const info = await this.run(input, path.join(dir, 'out'), await this.threadsFor(orderItemId));
      const [png, pes] = await Promise.all([fs.readFile(path.join(dir, 'out', 'preview.png')), fs.readFile(path.join(dir, 'out', 'design.pes'))]);
      const meta = { orderItemId, customerId: item.order.customerId };
      const source = await this.files.saveRaw('STITCH_FILE', data, 'application/octet-stream', ext, { ...meta, originalName: filename });
      const pesUp = ext === 'pes' ? source : await this.files.saveRaw('STITCH_FILE', pes, 'application/octet-stream', 'pes', { ...meta, originalName: `${label || 'design'}.pes` });
      const preview = await this.files.save('STITCH_PREVIEW', await this.files.processImage(png, 'STITCH_PREVIEW'), meta);
      const row = await this.db.stitchFile.create({
        data: {
          orderItemId,
          label: label.slice(0, 80) || filename,
          format: ext,
          sourceUploadId: source.id,
          pesUploadId: pesUp.id,
          previewUploadId: preview.id,
          stitches: info.stitches,
          colourChanges: info.colourChanges,
          widthMm: info.widthMm,
          heightMm: info.heightMm,
          threads: info.threads as object[],
          createdById: adminId,
        },
      });
      await this.db.orderEvent.create({
        data: { orderId: item.orderId, type: 'stitch_file', message: `Machine file added for ${item.name}: ${info.stitches.toLocaleString('en-IN')} stitches, ${info.widthMm}×${info.heightMm} mm`, actor: 'ADMIN', adminId, visible: false },
      });
      return row;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
