import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { useVirtualizer, observeElementRect } from '@tanstack/react-virtual';
import { TreeNode } from './TreeNode';
import { flattenTree } from './flattenTree';
import { getExpandedPaths } from './pathUtils';

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
}: Record<string, any>) {
  const styles = useStyles('TreeView');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // Keep the latest data available without making it an effect dependency.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Apply expandLevel/expandPaths only on mount and when those props (or the
  // iterator identity) change — NOT on every `data` change. Re-asserting on each
  // refresh would re-expand paths the user has collapsed, breaking the
  // "expand/collapse state decoupled from data" guarantee under live refresh.
  useLayoutEffect(
    () =>
      setExpandedPaths((prevExpandedPaths) =>
        getExpandedPaths(dataRef.current, dataIterator, expandPaths, expandLevel, prevExpandedPaths)
      ),
    [dataIterator, expandPaths, expandLevel]
  );

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
    // Seed a sensible window before the scroll element is measured.
    initialRect: { width: 0, height: numericHeight },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      role="tree"
      style={{
        ...styles.treeViewOutline,
        height: toCssSize(height),
        maxHeight: toCssSize(maxHeight),
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
              onClick={() => row.hasChildren && toggleExpand(row.path)}
              virtualStyle={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: rowHeight,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
