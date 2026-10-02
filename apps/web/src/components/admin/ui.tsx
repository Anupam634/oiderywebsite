'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Search } from '../icons';

export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
export const dayTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function Pill({ v, text }: { v: string; text?: string }) {
  return <span className={`pill2 ${v}`}>{text ?? label(v)}</span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="acts">{children}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="search">
      <Search />
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} aria-label={placeholder} />
    </label>
  );
}

/** load data and reload on demand; keeps the last good value while reloading */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    return fn().then(setData, (e: Error) => setError(e.message || 'Could not load'));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
  }, [load]);
  return { data, setData, error, reload: load };
}

export function Loading() {
  return <div className="panel blank" aria-busy="true">Loading…</div>;
}

export function ModalCard({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
