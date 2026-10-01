/* One-off import: reads the approved static design (../../design/src/*.js) and writes catalog.json,
   the seed data for the database. Kept for traceability; edit catalog.json (or use the admin) from now on.
   Usage: node prisma/seed/import-from-design.mjs */
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = '/home/anupam/embroidery-store/design/src/';
const read = (f) => fs.readFileSync(SRC + f, 'utf8');

/* return the literal assigned by `const NAME=` (array/object), matching brackets and skipping strings */
function literal(src, name) {
  const at = src.indexOf(`const ${name}=`);
  if (at < 0) throw new Error('missing ' + name);
  let i = at + `const ${name}=`.length;
  const open = src[i], close = open === '[' ? ']' : '}';
  let depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === open || c === '[' || c === '{') depth++;
    else if (c === close || c === ']' || c === '}') { depth--; if (depth === 0) return vm.runInNewContext('(' + src.slice(i, j + 1) + ')'); }
  }
  throw new Error('unterminated ' + name);
}
const core = read('lib-core.js'), pdp = read('product.js'), shop = read('shop.js');
const CATS = literal(core, 'CATS'), SUBS = literal(core, 'SUBS'), PRODUCTS = literal(core, 'PRODUCTS');
const PD = literal(pdp, 'PD'), PAIRS = literal(pdp, 'PAIRS'), VAR = literal(pdp, 'VAR'), RVS = literal(pdp, 'RVS');
const BLURB = literal(shop, 'BLURB');

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
const paise = (r) => Math.round(r * 100);
const TYPE = { ready: 'READY', personalise: 'PERSONALISE', made: 'MADE_TO_ORDER', logo: 'LOGO' };
const SHIP = { ready: 'READY', made: 'MADE', custom: 'CUSTOM' };
const GARMENT_HEX = { natural: '#EFE6D6', white: '#F4F4F2', kajal: '#1d1b21', neel: '#1f2a4f', maroon: '#6b1d2e', bottle: '#1e4d3a', haldi: '#dfa51c', gulaab: '#f2a0bd', chandi: '#9ba1a9', sky: '#a9cfec' };
const DAY = 864e5, BASE = Date.UTC(2026, 8, 30);

const categories = [
  ...CATS.map(([slug, name], i) => ({ slug, name, blurb: BLURB[slug] ?? null, image: null, sortOrder: i, parent: null })),
  ...Object.entries(SUBS).map(([slug, [name, parent, img]], i) => ({ slug, name, blurb: null, image: `photos/${img}.jpg`, sortOrder: i, parent })),
];

const studioCopy = {
  logopolo: { story: 'A soft cotton piqué polo with your logo embroidered on the chest. Upload your logo in the design studio, see it stitched on the real polo, and order one piece or five hundred.', spec: [['Technique', 'Satin and fill stitch, digitized from your logo'], ['Fabric', 'Cotton piqué, 220 GSM'], ['Placement', 'Left or right chest, 5–10 cm wide'], ['Minimum', 'From 1 piece; bulk prices from 10'], ['Digitizing', '₹399 once, free on 25+ pieces'], ['Made', 'Stitched in our studio']] },
  teamcap: { story: 'A structured cotton twill cap with your team crest stitched on the front panel. Upload your logo in the design studio and see it on the real cap first.', spec: [['Technique', 'Satin and fill stitch'], ['Fabric', 'Cotton twill, 5 panels'], ['Placement', 'Front, up to 11 cm wide'], ['Minimum', 'From 1 piece; bulk prices from 10'], ['Digitizing', '₹399 once, free on 25+ pieces'], ['Made', 'Stitched in our studio']] },
  logotote: { story: 'A sturdy canvas tote with your logo embroidered on the front. Great for events, cafés and welcome kits.', spec: [['Technique', 'Satin and fill stitch'], ['Fabric', '12 oz cotton canvas'], ['Placement', 'Centre or bottom corner'], ['Minimum', 'From 1 piece; bulk prices from 10'], ['Digitizing', '₹399 once, free on 25+ pieces'], ['Made', 'Stitched in our studio']] },
};

const products = PRODUCTS.map((p) => {
  const d = PD[p.id];
  const slug = slugify(p.name);
  const colours = d ? d.colours : [['Default', '#FFFFFF']];
  const sizes = d ? d.sizes : [['One size', null, 0, 999]];
  const variants = [];
  colours.forEach(([cname, cval], ci) => sizes.forEach(([sname, snote, extra, stock], si) => variants.push({
    sku: `${p.id}-${slugify(cname)}-${slugify(sname)}`.toUpperCase(),
    colourName: cname, colourValue: cval, colourHex: cval.startsWith('#') ? cval : GARMENT_HEX[cval] ?? '#FFFFFF',
    size: sizes.length > 1 || d ? sname : null, sizeNote: snote || null, priceDeltaPaise: paise(extra || 0),
    stock: stock ?? 0, trackStock: !(sname === 'Custom'), sortOrder: ci * 100 + si,
  })));
  const gallery = [];
  if (d) d.gal.forEach(([img, cap], i) => gallery.push({ path: `photos/${img}.jpg`, caption: cap, alt: img === p.img ? p.alt : cap, sortOrder: i }));
  const mainCap = d?.gal?.find(([img]) => img === p.img)?.[1] ?? null;
  // a sharper copy for the zoom lens, when the web app has one in public/photos/z/
  const zoom = (path) => {
    const z = path.replace(/^photos\//, 'photos/z/');
    return fs.existsSync(new URL(`../../../web/public/${z}`, import.meta.url)) ? z : null;
  };
  const images = [
    { role: 'MAIN', path: `photos/${p.img}.jpg`, alt: p.alt, caption: mainCap, sortOrder: 0 },
    { role: 'HOVER', path: `photos/${p.img}-d.jpg`, alt: '', caption: null, sortOrder: 1 },
    ...gallery.filter((g) => g.path !== `photos/${p.img}.jpg`).map((g, i) => ({ role: 'GALLERY', ...g, sortOrder: 10 + i })),
  ].map((im) => ({ ...im, zoomPath: zoom(im.path) }));
  const reviews = RVS.map((r, i) => {
    const vr = VAR[p.id]?.[i];
    return {
      authorName: r.n, city: r.c, rating: r.r, createdAt: new Date(Date.parse(r.d + ' UTC')).toISOString(),
      body: i === 0 && d?.rv ? d.rv : r.t || 'Beautiful work, exactly as shown.', helpfulCount: r.h, isSample: true,
      photoPath: r.ph && d?.rph ? `photos/${d.rph[i % d.rph.length]}.jpg` : null,
      preview: r.ph && vr ? { colour: vr[0], palette: vr[1], text: vr[2] || '', font: vr[3] || null, thread: vr[4] || null } : null,
    };
  });
  return {
    code: p.id, slug, name: p.name, status: 'ACTIVE', type: TYPE[p.type], category: p.sub,
    pricePaise: paise(p.price), mrpPaise: p.mrp ? paise(p.mrp) : null,
    badgeText: p.badge?.[0] ?? null, badgeTone: p.badge?.[1]?.replace('bg-', '') ?? null,
    techLine: p.tech, story: d?.story ?? studioCopy[p.id]?.story ?? '',
    colourFamily: p.fam, occasions: p.occ ?? [], ratingAvg: p.rate, ratingCount: p.rev,
    popularity: p.pop, publishedAt: new Date(BASE - (10 - p.nw) * 7 * DAY).toISOString(),
    shipMode: d ? SHIP[d.ship] : 'CUSTOM', madeDays: d?.madeDays ?? null, shipNote: p.ship ?? null,
    isUnique: !!d?.unique, handMade: !!d?.hand, needsSize: !!p.sz, sizeLabel: d?.sizeLabel ?? null, sizeGuide: d?.guide ?? null,
    studioGarment: p.studio ?? null, studioSample: p.sample ?? null, petPhoto: !!d?.pet,
    personalisation: d?.perso ? { fee: paise(d.perso.fee), maxLength: d.perso.max, defaultText: d.perso.def, required: !!d.perso.req, defaultOn: !!(d.perso.req || d.perso.on), font: d.perso.font, thread: d.perso.color, flowerPresets: !!d.perso.pal } : null,
    livePreview: d?.live ? { view: d.live.view, place: d.live.place, box: d.live.box, motif: d.live.motif, motifColours: d.live.mcols ?? null, maxTextWidth: d.live.maxW ?? null, closeCrop: d.live.ck } : null,
    details: {
      why: (d?.why ?? []).map(([title, text]) => ({ title, text })),
      spec: (d?.spec ?? studioCopy[p.id]?.spec ?? []).map(([label, value]) => ({ label, value })),
      care: d?.care ?? [],
      faq: (d?.faq ?? []).map(([q, a]) => ({ q, a })),
      upClose: d?.up ? { path: `photos/${d.up[0]}.jpg`, caption: d.up[1] } : null,
    },
    images, variants, reviews, related: (PAIRS[p.id] ?? []).filter((x) => PRODUCTS.some((q) => q.id === x)),
  };
});
const out = new URL('./catalog.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify({ generatedFrom: 'design/src (static prototype)', categories, products }, null, 1));
console.log(`wrote ${categories.length} categories, ${products.length} products, ${products.reduce((a, p) => a + p.variants.length, 0)} variants, ${products.reduce((a, p) => a + p.reviews.length, 0)} reviews`);
