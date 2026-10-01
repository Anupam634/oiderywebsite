'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  COLOUR_FAMILIES,
  FONT_KEYS,
  FONT_LABEL,
  GST_RATES_BP,
  OCCASIONS,
  PRODUCT_TYPES,
  SIZE_GUIDES,
  THREAD_KEYS,
  THREAD_LABEL,
  TYPE_LABEL,
  formatRate,
  type AdminProduct,
  type AdminVariant,
} from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { ui } from '@/lib/store';
import { Close, Plus } from '../icons';
import { Loading, PageHead, Pill, useLoad } from './ui';

type Draft = Omit<AdminProduct, 'variants' | 'images' | 'id' | 'createdAt' | 'updatedAt' | 'ratingAvg' | 'ratingCount'>;
const toDraft = ({ variants: _v, images: _i, id: _id, createdAt: _c, updatedAt: _u, ratingAvg: _a, ratingCount: _n, ...d }: AdminProduct): Draft => d;
const DEFAULT_PERSO: NonNullable<AdminProduct['personalisation']> = { fee: 0, maxLength: 12, defaultText: '', required: false, defaultOn: true, font: 'script', thread: 'rani', flowerPresets: false };

export function ProductEditor({ id }: { id: string }) {
  const { data: p, setData } = useLoad(() => adminApi.product(id), [id]);
  const { data: cats } = useLoad(() => adminApi.categories(), []);
  const { data: all } = useLoad(() => adminApi.products(new URLSearchParams()), []);
  const [d, setD] = useState<Draft | null>(null);
  const [errs, setErrs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (p) setD(toDraft(p));
  }, [p]);
  if (!p || !d) return <Loading />;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(p));

  async function save(patch: Partial<Draft> = {}) {
    setBusy(true);
    setErrs(null);
    try {
      const saved = await adminApi.updateProduct(id, { ...d!, ...patch });
      setData(saved);
      ui.toast('Saved');
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { path: string; message: string }[]).map((x) => `${x.path.replace(/^\//, '')}: ${x.message}`).join(' · ') : '';
      setErrs(`${e instanceof ApiError ? e.message : 'Could not save'}${details ? ` (${details})` : ''}`);
    } finally {
      setBusy(false);
    }
  }
  const leaves = (cats ?? []).filter((c) => c.parentId);
  const missing = [!p.images.some((i) => i.role === 'MAIN') && 'a main photo', !d.techLine && 'a short line under the name', !d.story && 'the story', !p.variants.length && 'at least one variant'].filter(Boolean);

  return (
    <>
      <PageHead title={d.name || 'Product'} sub={<><Pill v={p.status} text={p.status === 'ACTIVE' ? 'In the shop' : undefined} /> <Link className="muted" href={`/p/${p.slug}`} target="_blank">/p/{p.slug} ↗</Link></>}>
        <Link className="btn line" href="/admin/products">All products</Link>
        {p.status !== 'ACTIVE' && <button className="btn btn-grad" type="button" disabled={busy || missing.length > 0} title={missing.length ? `Add ${missing.join(', ')} first` : ''} onClick={() => void save({ status: 'ACTIVE' })}>Put in the shop</button>}
        {p.status === 'ACTIVE' && <button className="btn line" type="button" disabled={busy} onClick={() => void save({ status: 'DRAFT' })}>Hide from the shop</button>}
        <button className="btn btn-ink" type="button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      </PageHead>
      {p.status !== 'ACTIVE' && missing.length > 0 && <div className="note" style={{ marginBottom: 14 }}>Before it goes in the shop, add {missing.join(', ')}.</div>}
      {errs && <div className="note" style={{ marginBottom: 14 }}>{errs}</div>}

      <div className="grid2">
        <div>
          <Section title="Basics">
            <div className="formgrid">
              <label className="f full"><span>Name</span><input value={d.name} onChange={(e) => set('name', e.target.value)} /></label>
              <label className="f"><span>Link <i>(/p/…)</i></span><input value={d.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></label>
              <label className="f"><span>Code <i>(SKU prefix)</i></span><input value={d.code} onChange={(e) => set('code', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} /></label>
              <label className="f"><span>Category</span><select value={d.categoryId} onChange={(e) => set('categoryId', e.target.value)}>{leaves.map((c) => <option key={c.id} value={c.id}>{(cats ?? []).find((x) => x.id === c.parentId)?.name} › {c.name}</option>)}</select></label>
              <label className="f"><span>Type</span><select value={d.type} onChange={(e) => set('type', e.target.value as Draft['type'])}>{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
              <label className="f"><span>Price (₹)</span><input inputMode="numeric" value={d.pricePaise / 100} onChange={(e) => set('pricePaise', Number(e.target.value.replace(/\D/g, '')) * 100)} /></label>
              <label className="f"><span>MRP (₹) <i>(struck through; blank for none)</i></span><input inputMode="numeric" value={d.mrpPaise ? d.mrpPaise / 100 : ''} onChange={(e) => set('mrpPaise', e.target.value ? Number(e.target.value.replace(/\D/g, '')) * 100 : null)} /></label>
              <label className="f full"><span>Line under the name</span><input value={d.techLine} maxLength={120} onChange={(e) => set('techLine', e.target.value)} placeholder="e.g. Satin stitch and French knots on cotton canvas" /></label>
              <label className="f full"><span>Story</span><textarea value={d.story} maxLength={2000} onChange={(e) => set('story', e.target.value)} /></label>
              <label className="f"><span>Badge <i>(optional)</i></span><input value={d.badgeText ?? ''} maxLength={24} onChange={(e) => set('badgeText', e.target.value || null)} placeholder="e.g. Bestseller" /></label>
              <label className="f"><span>Badge colour</span><select value={d.badgeTone ?? 'rani'} onChange={(e) => set('badgeTone', e.target.value)}>{['rani', 'haldi', 'mor', 'neel', 'sindoor', 'mehendi', 'ink'].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="f"><span>Colour family <i>(shop filter)</i></span><select value={d.colourFamily} onChange={(e) => set('colourFamily', e.target.value)}>{COLOUR_FAMILIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              <label className="f"><span>Popularity <i>(higher shows first)</i></span><input inputMode="numeric" value={d.popularity} onChange={(e) => set('popularity', Number(e.target.value.replace(/\D/g, '')))} /></label>
              <div className="f full"><span>Occasions</span>
                <div className="row">{OCCASIONS.map((o) => <label key={o.key} className="chk"><input type="checkbox" checked={d.occasions.includes(o.key)} onChange={(e) => set('occasions', e.target.checked ? [...d.occasions, o.key] : d.occasions.filter((x) => x !== o.key))} />{o.label}</label>)}</div>
              </div>
            </div>
          </Section>

          <Variants p={p} onSaved={setData} />
          <Photos p={p} onSaved={setData} />

          <Section title="Details on the product page">
            <ListEdit label="Why you’ll love it" items={d.details.why} empty={{ title: '', text: '' }} max={6} onChange={(why) => set('details', { ...d.details, why })}
              render={(x, ch) => <><input value={x.title} placeholder="Title" maxLength={40} onChange={(e) => ch({ ...x, title: e.target.value })} /><input value={x.text} placeholder="One line" maxLength={200} onChange={(e) => ch({ ...x, text: e.target.value })} /></>} />
            <ListEdit label="Specifications" items={d.details.spec} empty={{ label: '', value: '' }} max={14} onChange={(spec) => set('details', { ...d.details, spec })}
              render={(x, ch) => <><input value={x.label} placeholder="e.g. Fabric" maxLength={40} onChange={(e) => ch({ ...x, label: e.target.value })} /><input value={x.value} placeholder="e.g. Cotton silk" maxLength={200} onChange={(e) => ch({ ...x, value: e.target.value })} /></>} />
            <ListEdit label="Care" items={d.details.care} empty="" max={10} onChange={(care) => set('details', { ...d.details, care })}
              render={(x, ch) => <input value={x} placeholder="e.g. Hand wash cold" maxLength={200} onChange={(e) => ch(e.target.value)} />} />
            <ListEdit label="Questions" items={d.details.faq} empty={{ q: '', a: '' }} max={12} onChange={(faq) => set('details', { ...d.details, faq })}
              render={(x, ch) => <><input value={x.q} placeholder="Question" maxLength={200} onChange={(e) => ch({ ...x, q: e.target.value })} /><input value={x.a} placeholder="Answer" maxLength={800} onChange={(e) => ch({ ...x, a: e.target.value })} /></>} />
          </Section>
        </div>

        <div>
          <Section title="Making & shipping">
            <div className="formgrid">
              <label className="f"><span>Ships as</span><select value={d.shipMode} onChange={(e) => set('shipMode', e.target.value as Draft['shipMode'])}><option value="READY">Ready (1–2 days)</option><option value="MADE">Made to order</option><option value="CUSTOM">Made for you (prepaid)</option></select></label>
              <label className="f"><span>Making days <i>(blank = default)</i></span><input inputMode="numeric" value={d.madeDays ?? ''} onChange={(e) => set('madeDays', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)} /></label>
              <label className="f full"><span>Shipping note <i>(optional)</i></span><input value={d.shipNote ?? ''} maxLength={120} onChange={(e) => set('shipNote', e.target.value || null)} /></label>
              <label className="chk"><input type="checkbox" checked={d.isUnique} onChange={(e) => set('isUnique', e.target.checked)} />One of a kind</label>
              <label className="chk"><input type="checkbox" checked={d.handMade} onChange={(e) => set('handMade', e.target.checked)} />Hand-embroidered</label>
              <label className="chk"><input type="checkbox" checked={d.needsSize} onChange={(e) => set('needsSize', e.target.checked)} />Needs a size</label>
              <label className="chk"><input type="checkbox" checked={d.petPhoto} onChange={(e) => set('petPhoto', e.target.checked)} />Customer sends a pet photo</label>
              <label className="f"><span>Size label</span><input value={d.sizeLabel ?? ''} onChange={(e) => set('sizeLabel', e.target.value || null)} placeholder="e.g. Size" /></label>
              <label className="f"><span>Size guide</span><select value={d.sizeGuide ?? ''} onChange={(e) => set('sizeGuide', e.target.value || null)}><option value="">None</option>{Object.keys(SIZE_GUIDES).map((k) => <option key={k}>{k}</option>)}</select></label>
            </div>
          </Section>

          <Section title="Personalisation">
            <label className="chk"><input type="checkbox" checked={!!d.personalisation} onChange={(e) => set('personalisation', e.target.checked ? (p.personalisation ?? DEFAULT_PERSO) : null)} />Customers can add a name</label>
            {d.personalisation && (
              <div className="formgrid" style={{ marginTop: 10 }}>
                <label className="f"><span>Extra charge (₹)</span><input inputMode="numeric" value={d.personalisation.fee / 100} onChange={(e) => set('personalisation', { ...d.personalisation!, fee: Number(e.target.value.replace(/\D/g, '')) * 100 })} /></label>
                <label className="f"><span>Longest name</span><input inputMode="numeric" value={d.personalisation.maxLength} onChange={(e) => set('personalisation', { ...d.personalisation!, maxLength: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></label>
                <label className="f"><span>Example name</span><input value={d.personalisation.defaultText} onChange={(e) => set('personalisation', { ...d.personalisation!, defaultText: e.target.value })} /></label>
                <label className="f"><span>Font</span><select value={d.personalisation.font} onChange={(e) => set('personalisation', { ...d.personalisation!, font: e.target.value })}>{FONT_KEYS.map((k) => <option key={k} value={k}>{FONT_LABEL[k]}</option>)}</select></label>
                <label className="f"><span>Thread</span><select value={d.personalisation.thread} onChange={(e) => set('personalisation', { ...d.personalisation!, thread: e.target.value })}>{THREAD_KEYS.map((k) => <option key={k} value={k}>{THREAD_LABEL[k]}</option>)}</select></label>
                <label className="chk"><input type="checkbox" checked={d.personalisation.required} onChange={(e) => set('personalisation', { ...d.personalisation!, required: e.target.checked })} />Name required</label>
                <label className="chk"><input type="checkbox" checked={d.personalisation.defaultOn} onChange={(e) => set('personalisation', { ...d.personalisation!, defaultOn: e.target.checked })} />Name switched on by default</label>
                <label className="chk"><input type="checkbox" checked={d.personalisation.flowerPresets} onChange={(e) => set('personalisation', { ...d.personalisation!, flowerPresets: e.target.checked })} />Flower colour choices</label>
              </div>
            )}
            <details style={{ marginTop: 12 }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>Live preview settings (advanced)</summary>
              <JsonField value={d.livePreview} onChange={(v) => set('livePreview', v as Draft['livePreview'])} />
              <div className="formgrid" style={{ marginTop: 8 }}>
                <label className="f"><span>Studio garment <i>(logo items)</i></span><input value={d.studioGarment ?? ''} onChange={(e) => set('studioGarment', e.target.value || null)} placeholder="tee, polo, cap, tote…" /></label>
                <label className="f"><span>Studio sample</span><input value={d.studioSample ?? ''} onChange={(e) => set('studioSample', e.target.value || null)} placeholder="chai, mono, team" /></label>
              </div>
            </details>
          </Section>

          <Section title="GST">
            <div className="formgrid">
              <label className="f"><span>HSN code</span><input inputMode="numeric" value={d.hsnCode} onChange={(e) => set('hsnCode', e.target.value.replace(/\D/g, '').slice(0, 8))} /></label>
              <label className="f"><span>Rate</span><select value={d.gstRule === 'threshold' ? 'threshold' : String(d.gstRateBp)} onChange={(e) => (e.target.value === 'threshold' ? setD({ ...d, gstRule: 'threshold' }) : setD({ ...d, gstRule: 'flat', gstRateBp: Number(e.target.value) }))}>
                <option value="threshold">Clothing & textiles: 5% up to ₹2,500, 18% above</option>
                {GST_RATES_BP.map((r) => <option key={r} value={r}>{formatRate(r)} on every piece</option>)}
              </select></label>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>Please confirm the HSN code and rate with your CA.</p>
          </Section>

          <Section title="Search engines">
            <div className="formgrid">
              <label className="f full"><span>Title <i>(up to 70)</i></span><input value={d.seoTitle ?? ''} maxLength={70} onChange={(e) => set('seoTitle', e.target.value || null)} placeholder={d.name} /></label>
              <label className="f full"><span>Description <i>(up to 170)</i></span><textarea value={d.seoDescription ?? ''} maxLength={170} onChange={(e) => set('seoDescription', e.target.value || null)} placeholder={d.story.slice(0, 160)} /></label>
            </div>
          </Section>

          <Section title="You may also like">
            <div className="list-edit">
              {d.related.map((r) => {
                const rp = (all ?? []).find((x) => x.id === r);
                return (
                  <div key={r} className="row"><span className="sp">{rp?.name ?? r}</span><button className="btn line sm" type="button" aria-label="Remove" onClick={() => set('related', d.related.filter((x) => x !== r))}><Close style={{ width: 14 }} /></button></div>
                );
              })}
              {d.related.length < 8 && (
                <select value="" onChange={(e) => e.target.value && set('related', [...d.related, e.target.value])} style={{ padding: 9, borderRadius: 12, border: '1.5px solid var(--line)' }}>
                  <option value="">Add a product…</option>
                  {(all ?? []).filter((x) => x.id !== p.id && !d.related.includes(x.id) && x.status === 'ACTIVE').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function ListEdit<T>({ label, items, empty, max, onChange, render }: { label: string; items: T[]; empty: T; max: number; onChange: (v: T[]) => void; render: (x: T, change: (v: T) => void) => ReactNode }) {
  return (
    <div className="f" style={{ marginBottom: 14 }}>
      <span>{label}</span>
      <div className="list-edit">
        {items.map((x, i) => (
          <div key={i} className="row">
            {render(x, (v) => onChange(items.map((y, j) => (j === i ? v : y))))}
            <button className="btn line sm" type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Close style={{ width: 14 }} /></button>
          </div>
        ))}
        {items.length < max && <button className="btn line sm" type="button" style={{ justifySelf: 'start' }} onClick={() => onChange([...items, empty])}><Plus />Add</button>}
      </div>
    </div>
  );
}

function JsonField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : '');
  const [bad, setBad] = useState(false);
  return (
    <label className={`f${bad ? ' bad' : ''}`} style={{ marginTop: 8 }}>
      <textarea style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, minHeight: 140 }} value={text} onChange={(e) => {
        setText(e.target.value);
        if (!e.target.value.trim()) return setBad(false), onChange(null);
        try {
          onChange(JSON.parse(e.target.value));
          setBad(false);
        } catch {
          setBad(true);
        }
      }} />
      <small>{bad ? 'Not valid JSON yet' : 'view, place, box [w, h cm], motif, motifColours, maxTextWidth, closeCrop'}</small>
    </label>
  );
}

function Variants({ p, onSaved }: { p: AdminProduct; onSaved: (p: AdminProduct) => void }) {
  const [rows, setRows] = useState<AdminVariant[]>(p.variants);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(p.variants), [p.variants]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(p.variants);
  const set = (i: number, patch: Partial<AdminVariant>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="panel">
      <h2>Colours, sizes &amp; stock</h2>
      <div className="tblwrap">
        <table className="tbl vt">
          <thead><tr><th>SKU</th><th>Colour</th><th /><th>Size</th><th>Extra ₹</th><th>Stock</th><th>Track</th><th /></tr></thead>
          <tbody>
            {rows.map((v, i) => (
              <tr key={v.id ?? `new-${i}`}>
                <td><input value={v.sku} onChange={(e) => set(i, { sku: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} style={{ minWidth: 150 }} /></td>
                <td><input value={v.colourName} onChange={(e) => set(i, { colourName: e.target.value })} style={{ minWidth: 110 }} /></td>
                <td><input type="color" value={v.colourHex} onChange={(e) => set(i, { colourHex: e.target.value, ...(v.colourValue.startsWith('#') ? { colourValue: e.target.value } : {}) })} style={{ width: 40, padding: 2 }} aria-label="Colour" /></td>
                <td><input value={v.size ?? ''} onChange={(e) => set(i, { size: e.target.value || null })} style={{ minWidth: 70 }} /></td>
                <td><input inputMode="numeric" value={v.priceDeltaPaise / 100} onChange={(e) => set(i, { priceDeltaPaise: Number(e.target.value.replace(/[^\d-]/g, '')) * 100 || 0 })} style={{ width: 70 }} /></td>
                <td><input inputMode="numeric" value={v.stock} onChange={(e) => set(i, { stock: Number(e.target.value.replace(/\D/g, '')) })} style={{ width: 64 }} /></td>
                <td><input type="checkbox" checked={v.trackStock} onChange={(e) => set(i, { trackStock: e.target.checked })} aria-label="Track stock" style={{ width: 18 }} /></td>
                <td><button className="btn line sm" type="button" aria-label="Remove" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Close style={{ width: 14 }} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn line sm" type="button" onClick={() => { const last = rows.at(-1)!; setRows([...rows, { ...last, id: undefined, sku: `${last.sku}-2`, size: null, stock: 0, sortOrder: rows.length }]); }}><Plus />Add a variant</button>
        <span className="sp" />
        <button className="btn btn-ink sm" type="button" disabled={!dirty || busy} onClick={async () => {
          setBusy(true);
          try {
            onSaved(await adminApi.saveVariants(p.id, rows.map((r, n) => ({ ...r, sortOrder: n }))));
            ui.toast('Stock saved');
          } catch (e) {
            ui.toast(e instanceof ApiError ? e.message : 'Could not save');
          } finally {
            setBusy(false);
          }
        }}>Save stock</button>
      </div>
    </div>
  );
}

function Photos({ p, onSaved }: { p: AdminProduct; onSaved: (p: AdminProduct) => void }) {
  const [imgs, setImgs] = useState(p.images);
  const [busy, setBusy] = useState(false);
  useEffect(() => setImgs(p.images), [p.images]);
  const dirty = JSON.stringify(imgs) !== JSON.stringify(p.images);
  const run = async (fn: () => Promise<AdminProduct>, ok: string) => {
    setBusy(true);
    try {
      onSaved(await fn());
      ui.toast(ok);
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, by: number) => {
    const next = [...imgs];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    setImgs(next);
  };
  return (
    <div className="panel">
      <h2>Photos</h2>
      <div className="imgs">
        {imgs.map((im, i) => (
          <div key={im.id} className="img">
            <img src={media(im.path)} alt={im.alt} />
            <div className="f">
              <select value={im.role} onChange={(e) => setImgs(imgs.map((x) => (x.id === im.id ? { ...x, role: e.target.value as typeof im.role } : e.target.value !== 'GALLERY' && x.role === e.target.value ? { ...x, role: 'GALLERY' } : x)))}>
                <option value="MAIN">Main photo</option><option value="HOVER">Shown on hover</option><option value="GALLERY">Gallery</option>
              </select>
              <input value={im.alt} placeholder="Describe the photo" onChange={(e) => setImgs(imgs.map((x) => (x.id === im.id ? { ...x, alt: e.target.value } : x)))} />
            </div>
            <div className="row">
              <button className="btn line sm" type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
              <button className="btn line sm" type="button" disabled={i === imgs.length - 1} onClick={() => move(i, 1)} aria-label="Move later">→</button>
              <span className="sp" />
              <button className="btn danger sm" type="button" disabled={busy} onClick={() => confirm('Remove this photo?') && void run(() => adminApi.removeImage(p.id, im.id), 'Photo removed')}>Remove</button>
            </div>
          </div>
        ))}
        <label className="drop" style={{ minHeight: 200, flexDirection: 'column' }}>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={async (e) => {
            const list = [...(e.target.files ?? [])];
            e.target.value = '';
            for (const f of list) await run(() => adminApi.addImage(p.id, f, imgs.length || list.indexOf(f) ? 'GALLERY' : 'MAIN', p.name), `Added ${f.name}`);
          }} />
          <Plus />{busy ? 'Uploading…' : 'Add photos'}
          <small className="muted">JPG, PNG or WEBP, up to 25 MB. Big photos get a sharper zoom.</small>
        </label>
      </div>
      {dirty && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="sp" />
          <button className="btn btn-ink sm" type="button" disabled={busy} onClick={() => void run(() => adminApi.saveImages(p.id, imgs.map(({ id, role, alt, caption }) => ({ id, role, alt, caption }))), 'Photos saved')}>Save photo order</button>
        </div>
      )}
    </div>
  );
}
