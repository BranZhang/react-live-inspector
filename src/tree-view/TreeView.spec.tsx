import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Inspector } from '../index';

// Regression: initial expandPaths/expandLevel must still apply when `data`
// arrives asynchronously *after* mount. The expand-state-decoupled-from-data
// optimization (effect deps without `data`) used to drop the initial expansion
// whenever data was empty on first render and filled in later.
describe('TreeView async initial expansion', () => {
  it('applies expandPaths once data arrives after an empty mount', () => {
    const { rerender } = render(<Inspector data={{}} expandPaths={['$']} />);

    // Empty data on mount: nothing to expand yet.
    expect(screen.queryAllByText('alpha')).toHaveLength(0);

    // Data filled in later (e.g. host sets it in a post-mount effect).
    rerender(<Inspector data={{ alpha: 1, beta: 2 }} expandPaths={['$']} />);

    // Root should now be expanded → its children are rendered as rows.
    expect(screen.queryAllByText('alpha').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('beta').length).toBeGreaterThan(0);
  });

  it('applies expandLevel once data arrives after an empty mount', () => {
    const { rerender } = render(<Inspector data={{}} expandLevel={2} />);
    expect(screen.queryAllByText('alpha')).toHaveLength(0);

    rerender(<Inspector data={{ nested: { alpha: 1 } }} expandLevel={2} />);

    // expandLevel=2 expands root + first level → the deep child row is visible.
    expect(screen.queryAllByText('alpha').length).toBeGreaterThan(0);
  });
});
