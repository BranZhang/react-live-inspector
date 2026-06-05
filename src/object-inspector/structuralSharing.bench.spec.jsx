import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ObjectInspector } from './ObjectInspector';

// Fresh object every frame; only ~1/3 of leaves change value.
const makeData = (t) => {
  const root = {};
  for (let g = 0; g < 10; g++) {
    const group = {};
    for (let i = 0; i < 10; i++) {
      const id = g * 10 + i;
      const hot = id % 3 === 0;
      group['leaf' + i] = { id, base: id * 2, value: hot ? id + t : id };
    }
    root['group' + g] = group;
  }
  return root;
};

function countNodeRendersOnRefresh(structuralSharing) {
  let count = 0;
  const nodeRenderer = ({ name }) => {
    count += 1;
    return React.createElement('span', null, String(name));
  };
  const props = (t) => ({ data: makeData(t), expandLevel: 5, structuralSharing, nodeRenderer });
  const { rerender } = render(React.createElement(ObjectInspector, props(0)));
  count = 0; // measure only the refresh, not the initial mount
  act(() => rerender(React.createElement(ObjectInspector, props(1))));
  return count;
}

describe('structural sharing + memo reduces node renders on partial refresh', () => {
  it('renders far fewer nodes with sharing ON than OFF (fresh object each frame)', () => {
    const off = countNodeRendersOnRefresh(false);
    const on = countNodeRendersOnRefresh(true);
    // Only ~1/3 of leaves change, so sharing should skip a large majority.
    expect(on).toBeLessThan(off * 0.6);
  });
});
