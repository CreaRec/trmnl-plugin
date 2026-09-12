export type TtlCache<T> = {
  get(): T | undefined;
  set(value: T): void;
  clear(): void;
};

/** Simple in-memory TTL cache (one slot). */
export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  let value: T | undefined;
  let expiresAt = 0;

  return {
    get(): T | undefined {
      if (value === undefined) return undefined;
      if (Date.now() >= expiresAt) {
        value = undefined;
        return undefined;
      }
      return value;
    },
    set(next: T): void {
      value = next;
      expiresAt = Date.now() + ttlMs;
    },
    clear(): void {
      value = undefined;
      expiresAt = 0;
    },
  };
}
