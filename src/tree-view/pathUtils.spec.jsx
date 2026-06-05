import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_ROOT_PATH, wildcardPathsFromLevel, getExpandedPaths } from './pathUtils';

const root = DEFAULT_ROOT_PATH;

// Minimal object iterator (mirrors ObjectInspector's createIterator).
function* objectIterator(data) {
  if (data === null || typeof data !== 'object') return;
  for (const key of Object.keys(data)) {
    yield { name: key, data: data[key] };
  }
}

describe('PathUtils', () => {
  beforeEach(() => {});

  it('wildcardPathsFromLevel works', () => {
    expect(wildcardPathsFromLevel(-1)).toEqual([]);

    expect(wildcardPathsFromLevel(0)).toEqual([]);

    expect(wildcardPathsFromLevel(1)).toEqual([root]);

    expect(wildcardPathsFromLevel(2)).toEqual([root, `${root}.*`]);

    expect(wildcardPathsFromLevel(3)).toEqual([root, `${root}.*`, `${root}.*.*`]);

    expect(wildcardPathsFromLevel(4)).toEqual([root, `${root}.*`, `${root}.*.*`, `${root}.*.*.*`]);
  });

  describe('getExpandedPaths', () => {
    const data = {
      a: { b: 1, c: 2 },
      d: 3,
      e: { f: { g: 4 } },
    };

    it('expands nothing when expandLevel is 0/undefined and no expandPaths', () => {
      expect(getExpandedPaths(data, objectIterator, undefined, 0, {})).toEqual({});
      expect(getExpandedPaths(data, objectIterator, undefined, undefined, {})).toEqual({});
    });

    it('expands only the root (branches) at expandLevel 1', () => {
      expect(getExpandedPaths(data, objectIterator, undefined, 1, {})).toEqual({ [root]: true });
    });

    it('expands every branch up to expandLevel via a single walk', () => {
      // level 2: root + its branch children (a, e); d is a leaf so omitted.
      expect(getExpandedPaths(data, objectIterator, undefined, 2, {})).toEqual({
        [root]: true,
        '$.a': true,
        '$.e': true,
      });
      // level 3 additionally reaches $.e.f.
      expect(getExpandedPaths(data, objectIterator, undefined, 3, {})).toEqual({
        [root]: true,
        '$.a': true,
        '$.e': true,
        '$.e.f': true,
      });
    });

    it('does not expand beyond the actual tree depth for huge expandLevel', () => {
      expect(getExpandedPaths(data, objectIterator, undefined, 1000, {})).toEqual({
        [root]: true,
        '$.a': true,
        '$.e': true,
        '$.e.f': true,
      });
    });

    it('merges explicit expandPaths (including wildcards) with expandLevel', () => {
      expect(getExpandedPaths(data, objectIterator, ['$', '$.e', '$.e.f'], 0, {})).toEqual({
        [root]: true,
        '$.e': true,
        '$.e.f': true,
      });
      expect(getExpandedPaths(data, objectIterator, ['$', '$.*'], 0, {})).toEqual({
        [root]: true,
        '$.a': true,
        '$.e': true,
      });
    });

    it('preserves previously expanded paths', () => {
      expect(getExpandedPaths(data, objectIterator, undefined, 1, { '$.custom': true })).toEqual({
        '$.custom': true,
        [root]: true,
      });
    });
  });
});
