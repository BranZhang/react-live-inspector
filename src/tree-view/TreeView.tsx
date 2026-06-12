import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { useVirtualizer, observeElementRect } from '@tanstack/react-virtual';
import { TreeNode } from './TreeNode';
import { flattenTree } from './flattenTree';
import { getExpandedPaths, hasChildNodes } from './pathUtils';

import { useStyles } from '../styles';

const DEFAULT_HEIGHT = 400;
const DEFAULT_ROW_HEIGHT = 16;
const DEFAULT_OVERSCAN = 20;

const toCssSize = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value);

const toNumber = (value: number | string | undefined, fallback: number) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
};

export const TreeView = memo(function TreeView({
  name,
  data,
  dataIterator,
  nodeRenderer,
  expandPaths,
  expandLevel,
  height = DEFAULT_HEIGHT,
  maxHeight,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  // When true, rows wrap instead of being clipped to a single line. Row heights
  // are then measured dynamically (variable size) instead of using the fixed
  // `rowHeight`. Defaults to false to keep the cheaper fixed-height path.
  multiline = false,
  // When true, the inspector fills the remaining space of a flex parent instead
  // of taking an explicit `height`. The scroll container then sizes itself via
  // `flex: 1; min-height: 0`, so a sibling above it (e.g. a search box) no longer
  // gets pushed out and forces a second scrollbar on the parent. Requires the
  // parent to be a flex column with a bounded height. `height`/`maxHeight` are
  // ignored for layout in this mode (still used only as the virtualizer's seed).
  fill = false,
}: Record<string, any>) {
  const styles = useStyles('TreeView');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // Whether the current expandPaths/expandLevel config has already been seeded
  // against data that actually has children. Re-armed whenever the config (or
  // iterator identity) changes so a new config is applied to the live data.
  const seededRef = useRef(false);
  useLayoutEffect(() => {
    seededRef.current = false;
  }, [dataIterator, expandPaths, expandLevel]);

  // Seed the initial expandLevel/expandPaths expansion exactly once, as soon as
  // `data` is non-trivial. We intentionally depend on `data` so the initial
  // expansion is applied even when data arrives asynchronously *after* mount
  // (e.g. the host fills it in a post-mount effect). The `seededRef` guard means
  // we do NOT re-assert on every subsequent refresh, preserving the
  // "expand/collapse state decoupled from data" guarantee under live refresh —
  // paths the user has manually collapsed stay collapsed.
  useLayoutEffect(() => {
    if (seededRef.current) return;
    // If there's something to expand but data has no children yet, defer until
    // real data shows up. With nothing configured to expand, seed immediately.
    const wantsExpansion = (expandLevel as number) > 0 || ([] as any[]).concat(expandPaths).some((p) => p != null);
    if (wantsExpansion && !hasChildNodes(data, dataIterator)) return;
    seededRef.current = true;
    setExpandedPaths((prevExpandedPaths) =>
      getExpandedPaths(data, dataIterator, expandPaths, expandLevel, prevExpandedPaths)
    );
  }, [data, dataIterator, expandPaths, expandLevel]);

  const toggleExpand = useCallback(
    (path: string) => setExpandedPaths((prev) => ({ ...prev, [path]: !prev[path] })),
    []
  );

  // Flatten the visible tree. Only expanded subtrees are walked, so even a
  // huge collapsed collection is cheap.
  const rows = useMemo(
    () => flattenTree(name, data, dataIterator, expandedPaths),
    [name, data, dataIterator, expandedPaths]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const numericHeight = toNumber(maxHeight ?? height, DEFAULT_HEIGHT);

  // Fall back to the configured height whenever the scroll element reports a
  // 0 height. This keeps the inspector usable when it is mounted in a not-yet
  // laid-out / detached container, and in headless environments (SSR, jsdom,
  // happy-dom) where getBoundingClientRect returns 0 — otherwise the virtualizer
  // would compute an empty window and render nothing.
  const observeRect = useCallback(
    (instance: any, cb: (rect: { width: number; height: number }) => void) =>
      observeElementRect(instance, (rect) => cb({ width: rect.width, height: rect.height || numericHeight })),
    [numericHeight]
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    observeElementRect: observeRect,
    // Measured heights are cached per item key (default: index). Rows shift
    // index on expand/collapse, so key by the stable node path instead —
    // otherwise stale heights land on the wrong rows, leaving gaps below some
    // rows and overlapping text below others.
    getItemKey: (index) => rows[index].path,
    // Seed a sensible window before the scroll element is measured.
    initialRect: { width: 0, height: numericHeight },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // CAVEAT (text rendering on a transparent background):
  // Each row is positioned with `transform: translateY(...)`. On Chromium/WebKit
  // a transformed element is painted into its own buffer, and sub-pixel (LCD)
  // antialiasing is disabled there unless the text has an *opaque* backdrop to
  // blend against. With a transparent inspector background the rows fall back to
  // grayscale antialiasing, so the scrolled region looks washed-out / hazy
  // (often perceived as a faint diagonal texture). This is inherent to any
  // transform-based virtualization (react-virtual, react-window, …), not a bug
  // in the measurement here. Fix it at the call site by giving the inspector
  // (or an ancestor) an opaque `background` matching the surrounding surface —
  // visually identical, but it restores sub-pixel antialiasing.
  return (
    <div
      ref={scrollRef}
      role="tree"
      style={{
        ...styles.treeViewOutline,
        ...(fill ? { flex: '1 1 0', minHeight: 0 } : { height: toCssSize(height), maxHeight: toCssSize(maxHeight) }),
        overflow: 'auto',
      }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TreeNode
              key={row.path}
              {...row}
              nodeRenderer={nodeRenderer}
              multiline={multiline}
              dataIndex={virtualRow.index}
              // In multiline mode the row height is measured from the DOM.
              measureRef={multiline ? rowVirtualizer.measureElement : undefined}
              onClick={() => row.hasChildren && toggleExpand(row.path)}
              virtualStyle={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                // Fixed height only in single-line mode; multiline rows size to content.
                ...(multiline ? null : { height: rowHeight }),
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
