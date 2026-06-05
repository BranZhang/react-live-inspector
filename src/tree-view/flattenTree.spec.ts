import { describe, it, expect } from 'vitest';
import { flattenTree } from './flattenTree';

// Minimal object iterator (mirrors the shape produced by ObjectInspector's
// createIterator: yields { name, data } for each own enumerable property).
function* objectIterator(data: any) {
  if (data === null || typeof data !== 'object') return;
  for (const key of Object.keys(data)) {
    yield { name: key, data: data[key] };
  }
}

describe('flattenTree', () => {
  const data = {
    a: { b: 1, c: 2 },
    d: 3,
    e: { f: { g: 4 } },
  };

  it('returns only the root when nothing is expanded', () => {
    const rows = flattenTree(undefined, data, objectIterator, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ path: '$', depth: 0, hasChildren: true, expanded: false });
  });

  it('walks expanded subtrees in order with correct depth', () => {
    const rows = flattenTree(undefined, data, objectIterator, {
      $: true,
      '$.a': true,
    });
    expect(rows.map((r) => r.path)).toEqual(['$', '$.a', '$.a.b', '$.a.c', '$.d', '$.e']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1, 1]);
  });

  it('omits descendants of collapsed nodes', () => {
    const rows = flattenTree(undefined, data, objectIterator, { $: true });
    expect(rows.map((r) => r.path)).toEqual(['$', '$.a', '$.d', '$.e']);
  });

  it('flags hasChildren correctly for leaves vs branches', () => {
    const rows = flattenTree(undefined, data, objectIterator, { $: true });
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r.hasChildren]));
    expect(byPath['$.a']).toBe(true);
    expect(byPath['$.d']).toBe(false);
  });

  it('does not mark a leaf as expanded even if its path is set', () => {
    const rows = flattenTree(undefined, data, objectIterator, { $: true, '$.d': true });
    const d = rows.find((r) => r.path === '$.d')!;
    expect(d.expanded).toBe(false);
  });

  it('carries extra iterator props through to the row', () => {
    function* extraIterator(d: any) {
      if (d === null || typeof d !== 'object') return;
      for (const key of Object.keys(d)) {
        yield { name: key, data: d[key], isNonenumerable: true };
      }
    }
    const rows = flattenTree(undefined, { a: 1 }, extraIterator, { $: true });
    expect(rows.find((r) => r.path === '$.a')!.isNonenumerable).toBe(true);
  });
});
