import { describe, it, expect } from 'vitest';
import { replaceEqualDeep } from './structuralSharing';

describe('replaceEqualDeep', () => {
  it('returns prev when deeply equal (fresh object, same values)', () => {
    const prev = { a: 1, b: { c: 2 } };
    const next = { a: 1, b: { c: 2 } };
    expect(replaceEqualDeep(prev, next)).toBe(prev);
  });

  it('reuses unchanged subtrees and only allocates changed paths', () => {
    const stable = { c: 2 };
    const prev = { a: 1, b: stable, d: { e: 3 } };
    const next = { a: 1, b: { c: 2 }, d: { e: 999 } };

    const result = replaceEqualDeep(prev, next);

    // root changed -> new reference
    expect(result).not.toBe(prev);
    // unchanged subtree b -> reuses prev reference
    expect(result.b).toBe(prev.b);
    // changed subtree d -> new reference reflecting the new value
    expect(result.d).not.toBe(prev.d);
    expect(result.d.e).toBe(999);
  });

  it('handles arrays, reusing untouched elements', () => {
    const prev = [{ x: 1 }, { x: 2 }, { x: 3 }];
    const next = [{ x: 1 }, { x: 22 }, { x: 3 }];

    const result = replaceEqualDeep(prev, next);

    expect(result).not.toBe(prev);
    expect(result[0]).toBe(prev[0]);
    expect(result[2]).toBe(prev[2]);
    expect(result[1]).not.toBe(prev[1]);
    expect(result[1].x).toBe(22);
  });

  it('treats length/key changes as changed', () => {
    expect(replaceEqualDeep([1, 2, 3], [1, 2])).toEqual([1, 2]);
    const prev = { a: 1, b: 2 };
    const next = { a: 1 };
    expect(replaceEqualDeep(prev, next)).not.toBe(prev);
  });

  it('reuses a buffer-like object (numeric keys) when bytes are identical', () => {
    const prev = { 0: 10, 1: 20, 2: 30 };
    const next = { 0: 10, 1: 20, 2: 30 };
    expect(replaceEqualDeep(prev, next)).toBe(prev);
  });

  it('does not descend into class instances (compared by reference)', () => {
    class Point {
      constructor(x) {
        this.x = x;
      }
    }
    const prev = new Point(1);
    const next = new Point(1);
    // Not a plain object -> keeps next reference (no false sharing).
    expect(replaceEqualDeep(prev, next)).toBe(next);
  });
});
