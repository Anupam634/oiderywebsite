/** Tiny TTL cache for hot read paths (catalogue). Call clear() after admin edits. */
export class TtlCache<V> {
  private store = new Map<string, { at: number; value: Promise<V> }>();
  constructor(private ttlMs: number) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.store.set(key, { at: Date.now(), value });
    value.catch(() => this.store.delete(key));
    return value;
  }

  clear() {
    this.store.clear();
  }
}
