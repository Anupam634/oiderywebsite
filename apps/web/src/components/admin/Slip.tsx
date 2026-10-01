'use client';
import { useEffect } from 'react';
import { BRAND, FONT_LABEL, THREAD_LABEL, formatPhone, type FontKey, type ThreadKey } from '@store/shared';
import { adminApi } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { rupees, useLoad } from './ui';

/** Packing slip + production sheet, printed and put in the parcel / on the machine table. */
export function Slip({ number }: { number: string }) {
  const { data: o, error } = useLoad(() => adminApi.order(number), [number]);
  useEffect(() => {
    document.body.style.background = '#fff';
  }, []);
  if (error) return <p style={{ padding: 24 }}>{error}</p>;
  if (!o) return <p style={{ padding: 24 }}>Loading…</p>;
  const gift = !!o.giftNote;
  return (
    <div className="slip">
      <div className="noprint" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className="btn btn-grad" type="button" style={{ height: 44 }} onClick={() => print()}>Print</button>
        <span style={{ alignSelf: 'center', color: '#8A819C', fontWeight: 650 }}>{gift ? 'Gift order: prices are hidden on this slip.' : 'Tip: print on A4 or A5.'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 700, fontSize: 30 }}>{BRAND.name.toLowerCase()}</div>
          <div style={{ color: '#6E6483' }}>{BRAND.tagline}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1>{o.number}</h1>
          <div>{new Date(o.placedAt ?? o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div><b>{o.shippingSpeed === 'EXPRESS' ? 'EXPRESS' : 'Standard'}</b> · {o.paymentMethod === 'COD' ? <b>COLLECT {rupees(o.totalPaise)} (COD)</b> : 'Prepaid'}</div>
        </div>
      </div>
      <div className="box" style={{ fontSize: 17, lineHeight: 1.5 }}>
        <div style={{ fontSize: 12, letterSpacing: '.12em', fontWeight: 800, color: '#E4007C' }}>DELIVER TO</div>
        <b>{o.ship.name}</b><br />
        {o.ship.line1}, {o.ship.line2}{o.ship.landmark ? `, ${o.ship.landmark}` : ''}<br />
        {o.ship.city}, {o.ship.state} <b>{o.ship.pincode}</b><br />
        {formatPhone(o.ship.phone)}
      </div>
      <table>
        <thead><tr><th /><th>Piece</th><th>Qty</th>{!gift && <th style={{ textAlign: 'right' }}>Amount</th>}<th>Packed</th></tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td>{i.image ? <img src={media(i.image)} alt="" /> : null}</td>
              <td>
                <b>{i.name}</b>
                <div style={{ color: '#51476A' }}>{i.description}</div>
                <div style={{ fontSize: 12, color: '#8A819C' }}>{i.sku}</div>
              </td>
              <td>{i.qty}</td>
              {!gift && <td style={{ textAlign: 'right' }}>{rupees(i.qty * i.unitPricePaise + i.extraPaise)}</td>}
              <td>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gift && (
        <div className="box">
          <div style={{ fontSize: 12, letterSpacing: '.12em', fontWeight: 800, color: '#E4007C' }}>GIFT NOTE</div>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20, margin: '6px 0 0' }}>“{o.giftNote}”</p>
        </div>
      )}
      {o.items.some((i) => i.personalisation || i.studio || i.petName) && (
        <div className="box" style={{ pageBreakBefore: 'auto' }}>
          <div style={{ fontSize: 12, letterSpacing: '.12em', fontWeight: 800, color: '#E4007C' }}>PRODUCTION SHEET</div>
          {o.items
            .filter((i) => i.personalisation || i.studio || i.petName)
            .map((i) => {
              const s = i.studio as { garment?: string; colour?: string; placement?: string; widthCm?: number; sizes?: Record<string, number>; threads?: { hex: string; name: string }[] } | null;
              return (
                <div key={i.id} style={{ marginTop: 10 }}>
                  <b>{i.name}</b> × {i.qty}
                  {i.personalisation && (
                    <div>
                      Name: <b style={{ fontSize: 20 }}>“{i.personalisation.text}”</b> · {FONT_LABEL[i.personalisation.font as FontKey] ?? i.personalisation.font} · {THREAD_LABEL[i.personalisation.thread as ThreadKey] ?? i.personalisation.thread} thread
                    </div>
                  )}
                  {i.petName && <div>Pet name: <b>“{i.petName}”</b></div>}
                  {s && <div>{s.garment} · {s.colour} · {s.placement}, {s.widthCm} cm{s.sizes ? ` · ${Object.entries(s.sizes).map(([k, n]) => `${k}×${n}`).join(', ')}` : ''}</div>}
                  {s?.threads?.length ? <div>Threads in order: {s.threads.map((t) => t.name).join(' → ')}</div> : null}
                  {i.proofs[0] && <div>Approved proof: v{i.proofs[0].version} ({i.proofs[0].status.toLowerCase()})</div>}
                  {i.stitchFiles.map((f) => (
                    <div key={f.id}>Machine file: {f.label}.{f.format} · {f.stitches.toLocaleString('en-IN')} stitches · threads: {f.threads.map((t) => t.name + (t.code ? ` (${t.code})` : '')).join(', ')}</div>
                  ))}
                </div>
              );
            })}
        </div>
      )}
      <p style={{ marginTop: 22, color: '#6E6483', fontSize: 13 }}>Thank you for shopping with {BRAND.name}! Questions? WhatsApp {BRAND.whatsapp}.</p>
    </div>
  );
}
