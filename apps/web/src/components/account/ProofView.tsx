'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BRAND } from '@store/shared';
import { ApiError } from '@/lib/api';
import { media } from '@/lib/media';
import { Chat, Check, Info } from '../icons';

interface ProofData {
  orderNumber: string;
  orderCancelled: boolean;
  firstName: string;
  item: { name: string; description: string; qty: number; preview: string | null };
  proof: { version: number; status: 'SENT' | 'APPROVED' | 'CHANGES_REQUESTED' | 'SUPERSEDED'; imageUrl: string; note: string; customerComment: string | null; sentAt: string; respondedAt: string | null };
  latest: boolean;
  latestToken: string | null;
  versions: number;
}

async function call(path: string, body?: object): Promise<ProofData> {
  const res = await fetch(`/api/v1/proofs/${path}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as (ProofData & { error?: { message: string; code: string } }) | null;
  if (!res.ok || !json) throw new ApiError(res.status, json?.error?.message ?? 'Something went wrong', json?.error?.code);
  return json;
}

/** The page behind the WhatsApp/email link: see the stitch proof, approve it or ask for changes. No login needed. */
export function ProofView({ token }: { token: string }) {
  const [d, setD] = useState<ProofData | null>(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => call(token).then(setD, () => setMissing(true)), [token]);
  useEffect(() => void load(), [load]);

  if (missing)
    return (
      <div className="co-card acc-empty" style={{ margin: '40px 0' }}>
        <b>We couldn’t find this proof</b>The link may be incomplete. Please open it again from WhatsApp or email.
      </div>
    );
  if (!d) return <div style={{ minHeight: 500 }} aria-busy="true" />;

  const answer = async (approve: boolean) => {
    setBusy(true);
    setMsg('');
    try {
      setD(await call(`${token}/${approve ? 'approve' : 'changes'}`, approve ? {} : { comment }));
      setMode('idle');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const p = d.proof;
  const wa = `https://wa.me/${BRAND.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! About the proof for order ${d.orderNumber}: `)}`;

  return (
    <div className="proofp">
      <div className="pimg">
        <img src={media(p.imageUrl)} alt={`Stitch proof for ${d.item.name}`} />
        <span className="ver">Proof {d.versions > 1 ? `version ${p.version}` : ''}</span>
      </div>
      <div>
        <span className="kicker">Order {d.orderNumber}</span>
        <h1>{p.status === 'APPROVED' ? <>Approved, <em>thank you!</em></> : <>{d.firstName}, here’s your <em>stitch proof</em></>}</h1>
        <p className="lead">
          <b>{d.item.name}</b>{d.item.qty > 1 ? ` × ${d.item.qty}` : ''}
          <br />
          {d.item.description}
        </p>
        {p.note && <div className="snote"><b>Note from the studio:</b> {p.note}</div>}

        {d.orderCancelled ? (
          <div className="done-box chg">This order was cancelled.</div>
        ) : !d.latest ? (
          <div className="done-box chg">
            There’s a newer proof for this piece.{' '}
            {d.latestToken && <Link className="link" href={`/proof/${d.latestToken}`}>See the latest proof</Link>}
          </div>
        ) : p.status === 'APPROVED' ? (
          <div className="done-box ok"><Check style={{ width: 18, display: 'inline', verticalAlign: '-3px' }} /> You approved this proof. We’ve started stitching and will WhatsApp you when it ships.</div>
        ) : p.status === 'CHANGES_REQUESTED' ? (
          <div className="done-box chg">You asked for changes: “{p.customerComment}”. We’ll send a new proof soon.</div>
        ) : mode === 'changes' ? (
          <div className="acts">
            <label className="fld"><span>What would you like changed?</span><textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Please make the name a little bigger and use the pink thread" autoFocus /></label>
            {msg && <p style={{ color: '#B91C1C', fontWeight: 700, margin: 0 }}>{msg}</p>}
            <button className="btn btn-grad" type="button" disabled={busy || comment.trim().length < 3} onClick={() => void answer(false)}>{busy ? 'Sending…' : 'Send my changes'}</button>
            <button className="btn" type="button" style={{ border: '1.5px solid var(--line)' }} onClick={() => setMode('idle')}>Back</button>
          </div>
        ) : (
          <div className="acts">
            <p className="otp-fine" style={{ margin: '0 0 4px' }}><Info style={{ width: 15, display: 'inline', verticalAlign: '-3px' }} /> We start stitching once you approve. Thread colours on screen can look slightly different from real thread.</p>
            {msg && <p style={{ color: '#B91C1C', fontWeight: 700, margin: 0 }}>{msg}</p>}
            <button className="btn btn-grad" type="button" disabled={busy} onClick={() => void answer(true)}><Check /><span>{busy ? 'Approving…' : 'Looks perfect, approve'}</span></button>
            <button className="btn" type="button" style={{ border: '1.5px solid var(--line)' }} onClick={() => setMode('changes')}>Request changes</button>
          </div>
        )}
        <div className="mini">
          {d.item.preview && <img src={media(d.item.preview)} alt="What you ordered" />}
          <div style={{ fontSize: 14 }}>
            <b>Questions?</b> The studio replies on WhatsApp.
            <div><a className="link" href={wa} target="_blank" rel="noopener"><Chat style={{ width: 15 }} /> Message us</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
