/**
 * Session-wide key/value store backing `ctx.memory` in macro scripts.
 *
 * Lifetime: values live until the app closes or the script calls
 * `delete` — they survive macro pause, death/respawn and reconnect
 * (those flows restart the engine via `stopMacro`/`startMacro`, so no
 * automatic clearing happens here). Scripts manage their own reset.
 *
 * Values are restricted to JSON-serializable shapes — that is what can cross
 * the QuickJS↔host boundary via `qctx.dump` and back.
 */

/** JSON-serializable value accepted by the script memory. */
export type MemoryValue =
  | null
  | boolean
  | number
  | string
  | MemoryValue[]
  | { [key: string]: MemoryValue };

const checkMemoryValue = (value: unknown, seen: WeakSet<object>): boolean => {
  if (value === null) return true;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object': {
      if (seen.has(value)) return false;
      if (Array.isArray(value)) {
        seen.add(value);
        const ok = value.every((entry) => checkMemoryValue(entry, seen));
        seen.delete(value);
        return ok;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;
      seen.add(value);
      const ok = Object.values(value as Record<string, unknown>).every((entry) =>
        checkMemoryValue(entry, seen),
      );
      seen.delete(value);
      return ok;
    }
    default:
      return false;
  }
};

/**
 * Guard: accepts only plain JSON-serializable shapes. Rejects functions,
 * undefined, symbols, bigint, non-finite numbers, class instances
 * (Map/Set/Date...) and reference cycles.
 */
export const isMemoryValue = (value: unknown): value is MemoryValue =>
  checkMemoryValue(value, new WeakSet());

const store = new Map<string, MemoryValue>();

export const getMemoryValue = (key: string): MemoryValue | undefined => store.get(key);

/** Stores a value, overwriting any previous entry under the same key. */
export const setMemoryValue = (key: string, value: MemoryValue): void => {
  store.set(key, value);
};

/** Removes the entry under `key` (no-op when absent). */
export const deleteMemoryValue = (key: string): void => {
  store.delete(key);
};

/** Wipes the whole store (test reset; not exposed to scripts). */
export const clearMemoryValues = (): void => {
  store.clear();
};
