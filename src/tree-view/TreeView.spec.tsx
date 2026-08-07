import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  it('remeasures a recycled multiline slot before positioning following rows', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const role = this.getAttribute('role');
      const height = role === 'treeitem' ? Math.max(16, Math.ceil((this.textContent?.length ?? 0) / 20) * 16) : 96;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: height,
        width: 320,
        height,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { container, rerender } = render(
        <React.StrictMode>
          <Inspector data={{ alpha: 'short', beta: 'also short' }} expandPaths={['$']} multiline height={96} />
        </React.StrictMode>
      );

      await waitFor(() => expect(container.querySelector('[data-index="2"]')).not.toBeNull());
      const recycledSlot = container.querySelector('[data-index="1"]');

      for (let tick = 0; tick < 20; tick += 1) {
        const changingText = tick % 2 === 0 ? 'short' : Array.from({ length: 8 }, () => 'x'.repeat(20)).join('\n');
        rerender(
          <React.StrictMode>
            <Inspector
              data={{ [`shifted_${tick}`]: changingText, beta: 'also short' }}
              expandPaths={['$']}
              multiline
              height={96}
            />
          </React.StrictMode>
        );
      }

      await waitFor(() => {
        const first = container.querySelector<HTMLElement>('[data-index="1"]');
        const second = container.querySelector<HTMLElement>('[data-index="2"]');
        expect(first).toBe(recycledSlot);
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();

        const firstTop = Number(first!.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        const secondTop = Number(second!.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        expect(secondTop).toBeGreaterThanOrEqual(firstTop + first!.getBoundingClientRect().height);
      });

      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('Maximum update depth exceeded');
    } finally {
      rectSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
