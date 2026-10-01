'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { PRODUCTION_LABEL } from '@store/shared';
import { adminApi } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { Loading, PageHead, Pill, day, useLoad } from './ui';

const STEPS = [
  ['', 'Everything open'],
  ['AWAITING_PROOF', 'Proof to make'],
  ['CHANGES_REQUESTED', 'Changes requested'],
  ['PROOF_SENT', 'Waiting on customer'],
  ['APPROVED', 'Approved: ready to stitch'],
  ['IN_PRODUCTION', 'On the machine'],
] as const;

/** Every made-for-you piece by production step, oldest first (express orders flagged). */
export function Production() {
  const router = useRouter();
  const status = useSearchParams().get('status') ?? '';
  const { data, error } = useLoad(() => adminApi.production(status || undefined), [status]);
  return (
    <>
      <PageHead title="Production" sub="Made-for-you pieces, oldest first. Open a piece to send its proof or add the machine file." />
      <div className="chips">
        {STEPS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={status === k} onClick={() => router.replace(`/admin/production${k ? `?status=${k}` : ''}`)}>{l}</button>
        ))}
      </div>
      {error && <div className="note">{error}</div>}
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <div className="panel blank">Nothing waiting here.</div>
      ) : (
        <div className="panel">
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th /><th>Piece</th><th>Order</th><th>Step</th><th>Files</th><th>Due</th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.itemId} onClick={() => router.push(`/admin/orders/${r.orderNumber}`)}>
                    <td><div className="stack">{r.image && <img src={media(r.image)} alt="" />}</div></td>
                    <td><b>{r.name}</b> × {r.qty}<div className="muted">{r.description}</div></td>
                    <td><b>{r.orderNumber}</b> {r.express && <Pill v="express" text="Express" />}<div className="muted">{r.customerName} · {day(r.orderDate)}</div></td>
                    <td><Pill v={r.status} text={PRODUCTION_LABEL[r.status]} />{r.proofVersion ? <div className="muted">proof v{r.proofVersion}</div> : null}</td>
                    <td>{r.stitchFiles ? <Pill v="DONE" text={`${r.stitchFiles} machine file${r.stitchFiles > 1 ? 's' : ''}`} /> : <span className="muted">none yet</span>}</td>
                    <td>{day(r.etaDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
