/* Browser smoke test for @store/stitch.
   1. bundles src/index.ts with esbuild → scripts/out/stitch.bundle.js
   2. serves packages/stitch at /, apps/web/public/mockups at /mockups/, the prototype's rendered photos at /ref/
      and (if present) the prototype site at /orig/ — on a local node:http server
   3. renders the tote and cap scenes in headless Chromium (puppeteer-core), saves scripts/out/<name>.png,
      and prints pixel-difference scores vs design/assets/photos/r-<name>.jpg (rendered by the original engine)
      plus an exact comparison with the original engine running in the same browser.
   Usage (from packages/stitch): node scripts/smoke-check.mjs [--serve]
   Env overrides: CHROME_PATH, PUPPETEER_CORE, ESBUILD_PATH, CHROME_LD_LIBRARY_PATH, DESIGN_DIR */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const PLATFORM = resolve(PKG, '../..');
const STORE = resolve(PLATFORM, '..');
const DESIGN = process.env.DESIGN_DIR ?? join(STORE, 'design');
const OUT = join(HERE, 'out');
const require = createRequire(import.meta.url);

function findEsbuild() {
  if (process.env.ESBUILD_PATH) return process.env.ESBUILD_PATH;
  const store = join(PLATFORM, 'node_modules/.pnpm');
  const dirs = readdirSync(store)
    .filter((d) => /^esbuild@\d/.test(d))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!dirs.length) throw new Error('esbuild not found under ' + store);
  return join(store, dirs[0], 'node_modules/esbuild');
}
const esbuild = require(findEsbuild());
const puppeteer = require(process.env.PUPPETEER_CORE ?? join(STORE, '.tooling/node/node_modules/puppeteer-core'));
const CHROME = process.env.CHROME_PATH ?? join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome');
const LD = process.env.CHROME_LD_LIBRARY_PATH ?? join(STORE, '.tooling/chrome-root/usr/lib/x86_64-linux-gnu');

const SCENES = [
  {
    name: 'tote',
    ref: 'r-tote.jpg',
    view: 'tote', col: 'natural', place: 'cc', box: [20, 24],
    design: { motif: 'phoolwari', mcols: ['rani', 'neel', 'mehendi', 'gulaab'], text: 'Priya', font: 'script', tcol: 'rani', maxW: 700 },
  },
  {
    name: 'cap',
    ref: 'r-cap.jpg',
    view: 'cap', col: 'kajal', place: 'fr', box: [7.5, 4.4],
    design: { motif: 'none', text: 'AK', font: 'classic', tcol: 'haldi' },
  },
];

/* ---- 1. bundle ---- */
mkdirSync(OUT, { recursive: true });
await esbuild.build({
  entryPoints: [join(PKG, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: join(OUT, 'stitch.bundle.js'),
  sourcemap: true,
  logLevel: 'warning',
});

/* ---- 2. static server ---- */
const ROUTES = [
  ['/mockups/', join(PLATFORM, 'apps/web/public/mockups')],
  ['/ref/', join(DESIGN, 'assets/photos')],
  ['/orig/', join(DESIGN, 'site')],
  ['/', PKG],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const [prefix, root] = ROUTES.find(([p]) => path.startsWith(p));
  const file = resolve(root, '.' + path.slice(prefix.length - 1));
  if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) {
  console.log(`serving ${BASE}/scripts/smoke.html (Ctrl+C to stop)`);
  await new Promise(() => {});
}

/* ---- 3. render + compare ---- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'], // --disable-gpu: the reference photos were rendered with it too
  env: { ...process.env, LD_LIBRARY_PATH: [LD, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
});
let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  /* report failed requests by URL (a missing favicon is not an error) */
  const watch = (pg, tag) =>
    pg.on('response', (res) => res.status() >= 400 && !/favicon/.test(res.url()) && errors.push(`${tag}${res.status()} ${res.url()}`));
  watch(page, '');
  await page.goto(`${BASE}/scripts/smoke.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__stitchReady === true', { timeout: 30000 });
  console.log(`Chromium ${await browser.version()}`);
  console.log(`paisley table vs this browser's SVG probe: max ${(await page.evaluate(() => window.checkPaisley())).toFixed(6)} px`);

  /* the original engine (design/site/_render.html), same browser, same scenes */
  let orig = null;
  if (existsSync(join(DESIGN, 'site/_render.html'))) {
    orig = await browser.newPage();
    orig.on('pageerror', (e) => errors.push('orig: ' + e.message));
    watch(orig, 'orig: ');
    await orig.goto(`${BASE}/orig/_render.html`, { waitUntil: 'networkidle0' });
  }

  for (const s of SCENES) {
    const r = await page.evaluate((spec) => window.runScene(spec), { ...s, ref: `/ref/${s.ref}` });
    writeFileSync(join(OUT, `${s.name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    writeFileSync(join(OUT, `${s.name}-diff.png`), Buffer.from(r.diff.split(',')[1], 'base64'));
    const refBytes = readFileSync(join(DESIGN, 'assets/photos', s.ref));
    const jpegBytes = Buffer.from(r.jpegDataUrl.split(',')[1], 'base64');
    console.log(`\n${s.name}: size ${r.size.toFixed(3)} cm, stitch map ${r.D.w}×${r.D.h}, threads ${r.D.threads.join(', ')}, ~${r.stitches} stitches, prepare ${r.ms.prepare} ms, render ${r.ms.render} ms`);
    console.log(`  vs ${s.ref} (raw render)      full: MAE ${r.vsRef.full.mae}  PSNR ${r.vsRef.full.psnr} dB  max ${r.vsRef.full.max}  >16: ${r.vsRef.full.over16pct}%`);
    console.log(`                               design area: MAE ${r.vsRef.design.mae}  PSNR ${r.vsRef.design.psnr} dB  max ${r.vsRef.design.max}  >16: ${r.vsRef.design.over16pct}%`);
    console.log(`  vs ${s.ref} (after JPEG q.86) full: MAE ${r.jpegVsRef.full.mae}  PSNR ${r.jpegVsRef.full.psnr ?? 'inf'} dB  max ${r.jpegVsRef.full.max}; JPEG bytes identical: ${jpegBytes.equals(refBytes)}`);
    if (orig) {
      const png = await orig.evaluate(async (spec, probes) => {
        const eng = window.eng;
        await Promise.all(probes.map((f) => document.fonts.load(f)));
        await eng.fontsLoaded();
        await eng.assetReady(spec.view);
        const { canvas, palette } = await eng.designFrom(spec.design);
        const D = eng.analyseKnown(canvas, palette);
        const S = { view: spec.view, col: spec.col, place: spec.place, size: Math.min(spec.box[0], (spec.box[1] * D.w) / D.h), off: [0, 0], D };
        return eng.snapshot(S, 'front', 800).toDataURL('image/png');
      }, s, ['84px "Archivo Black"', 'italic 700 260px "Playfair Display"', '800 32px "Plus Jakarta Sans"', '120px Pacifico', '120px "Yatra One"']);
      const c = await page.evaluate((a, b) => window.comparePng(a, b), r.png, png);
      console.log(`  vs original engine, same browser: ${c.diffPx} differing pixels, MAE ${c.mae}, max ${c.max}`);
      if (c.diffPx) failed = true;
    }
    if (r.vsRef.full.psnr < 30) failed = true;
  }
  if (errors.length) {
    console.log('\npage errors:\n  ' + errors.join('\n  '));
    failed = true;
  }
  console.log(`\nwrote ${OUT}/{tote,cap}.png (+ -diff.png heat maps vs the reference)`);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? 'SMOKE: FAIL' : 'SMOKE: OK');
process.exit(failed ? 1 : 0);
