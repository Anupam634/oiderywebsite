/* Shown at once when someone opens a listing, while the products load. */
export default function Loading() {
  return (
    <main id="top" className="wrap sk-page" aria-busy="true">
      <span className="vh" role="status">Loading products…</span>
      <div className="sk sk-h1" />
      <div className="sk-chips">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk sk-chip" />)}</div>
      <div className="grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="sk-card"><div className="sk sk-img" /><div className="sk sk-line" /><div className="sk sk-line sk-short" /></div>
        ))}
      </div>
    </main>
  );
}
