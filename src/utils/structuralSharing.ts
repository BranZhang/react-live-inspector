// Structural sharing for high-frequency `data` refresh.
//
// In live/streaming scenarios each frame's `data` is typically a brand-new
// object (e.g. `JSON.parse` of a websocket payload). Every node therefore has a
// new reference, so `React.memo` (which compares by reference) can never skip
// anything and the whole tree re-renders on every tick.
//
// `replaceEqualDeep(prev, next)` walks `prev` and `next` together and, wherever
// a subtree is deeply equal, returns the OLD (`prev`) reference instead of the
// new one. The result is a tree where unchanged subtrees keep a stable identity
// while changed paths get fresh objects — exactly what reference-equality memo
// needs. This is one O(n) pass per refresh, far cheaper than re-rendering every
// node. (Same idea as react-query's `replaceEqualDeep`.)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  // Only treat object-literals (and null-prototype objects) as deeply mergeable.
  // Class instances, Maps, Sets, DOM nodes, etc. are compared by reference to
  // avoid walking host/exotic objects or breaking their invariants.
  return proto === null || proto === Object.prototype;
}

/**
 * Return a value structurally shared with `prev`: any sub-value of `next` that
 * is deeply equal to the corresponding sub-value of `prev` is replaced by the
 * `prev` reference. Only plain arrays and plain objects are descended into;
 * everything else is compared with `Object.is`.
 */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;

  const prevIsArray = Array.isArray(prev);
  const nextIsArray = Array.isArray(next);

  if (prevIsArray && nextIsArray) {
    const prevArr = prev as unknown[];
    const nextArr = next as unknown[];
    const length = nextArr.length;
    const copy: unknown[] = new Array(length);
    let equal = prevArr.length === length;
    for (let i = 0; i < length; i++) {
      copy[i] = replaceEqualDeep(prevArr[i], nextArr[i]);
      if (copy[i] !== prevArr[i]) equal = false;
    }
    return (equal ? prev : copy) as T;
  }

  if (!prevIsArray && !nextIsArray && isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    const length = nextKeys.length;
    const copy: Record<string, unknown> = {};
    let equal = prevKeys.length === length;
    for (let i = 0; i < length; i++) {
      const key = nextKeys[i];
      copy[key] = replaceEqualDeep(prev[key], next[key]);
      if (copy[key] !== prev[key] || !(key in prev)) equal = false;
    }
    return (equal ? prev : copy) as T;
  }

  // Different types, primitives, or exotic objects: keep the new value.
  return next;
}
