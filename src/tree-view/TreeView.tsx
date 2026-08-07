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

const isScrollable = (el: Element) => {
  const { overflowY } = getComputedStyle(el);
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
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
  // 'self' (default): the inspector is its own scroll container, sized by
  // `height`/`maxHeight`/`fill`.
  // 'parent': the inspector grows to its content and virtualization windows
  // against the nearest scrollable ancestor instead (via scrollMargin). Use
  // this when an outer panel already owns scrolling: the inspector then never
  // shows a scrollbar of its own. This also avoids the scrollbar-induced
  // reflow trap of a near-fit self-scrolled inspector: the scrollbar steals
  // ~15px of width, wrapped rows get taller, and the (now real) few-pixel
  // overflow keeps the otherwise useless scrollbar alive.
  // `height`/`maxHeight`/`fill` are ignored for layout in this mode.
  scrollContainer = 'self',
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
  const getItemKey = useCallback((index: number) => rows[index]?.path ?? index, [rows]);

  // The list element (role=tree). In 'self' mode it is also the scroll
  // container; in 'parent' mode it just grows to its content.
  const listRef = useRef<HTMLDivElement>(null);
  const usesParentScroll = scrollContainer === 'parent';
  const numericHeight = toNumber(maxHeight ?? height, DEFAULT_HEIGHT);

  // 'parent' mode: nearest scrollable ancestor, resolved after mount.
  const [parentScroller, setParentScroller] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!usesParentScroll) {
      setParentScroller(null);
      return;
    }
    let el: HTMLElement | null = listRef.current?.parentElement ?? null;
    while (el && !isScrollable(el)) el = el.parentElement;
    setParentScroller(el ?? (document.scrollingElement as HTMLElement | null));
  }, [usesParentScroll]);

  // 'parent' mode: distance from the scroller's content origin to the top of
  // the list. Siblings above the inspector (toolbars, pinned rows) shift it,
  // so keep it in sync on every commit plus out-of-render size changes.
  const [scrollMargin, setScrollMargin] = useState(0);
  const updateScrollMargin = useCallback(() => {
    const list = listRef.current;
    const scroller = usesParentScroll ? parentScroller : null;
    if (!list || !scroller) return;
    const margin = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    // Sub-pixel jitter must not trigger render loops.
    setScrollMargin((prev) => (Math.abs(prev - margin) < 1 ? prev : margin));
  }, [usesParentScroll, parentScroller]);
  useLayoutEffect(updateScrollMargin);
  useLayoutEffect(() => {
    if (!usesParentScroll || !parentScroller || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScrollMargin);
    observer.observe(parentScroller);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [usesParentScroll, parentScroller]);

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
    getScrollElement: () => (usesParentScroll ? parentScroller : listRef.current),
    estimateSize: () => rowHeight,
    overscan,
    observeElementRect: observeRect,
    scrollMargin: usesParentScroll ? scrollMargin : 0,
    // Measured heights are cached per item key (default: index). Rows shift
    // index on expand/collapse, so key by the stable node path instead —
    // otherwise stale heights land on the wrong rows, leaving gaps below some
    // rows and overlapping text below others.
    getItemKey,
    // Seed a sensible window before the scroll element is measured.
    initialRect: { width: 0, height: numericHeight },
  });

  // React intentionally keys rows by virtual index so live structural updates
  // recycle mounted DOM slots. Height measurements, however, belong to the
  // logical row path. A recycled slot does not re-run a stable callback ref
  // when its path changes, leaving TanStack's element cache associated with
  // the previous path until ResizeObserver happens to report a size change.
  // During high-frequency multiline updates that delay is enough for following
  // rows to retain stale offsets and overlap.
  //
  // Observe the recycled slots ourselves and batch resizeItem writes into the
  // next animation frame. resizeItem resolves the current path for the slot's
  // index, preserving index-based DOM reuse without measuring synchronously in
  // React's ref commit (which can cause nested-update loops).
  const virtualizerRef = useRef(rowVirtualizer);
  virtualizerRef.current = rowVirtualizer;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const measuredNodesRef = useRef(new Map<number, HTMLDivElement>());
  const measuredPathsRef = useRef(new Map<number, string | undefined>());
  const measureRefCallbacksRef = useRef(new Map<number, (node: HTMLDivElement | null) => void>());
  const measurementObserverRef = useRef<ResizeObserver | null>(null);
  const pendingMeasurementsRef = useRef(new Map<HTMLDivElement, number | null>());
  const measurementFrameRef = useRef<number | null>(null);

  const flushMeasurements = useCallback(() => {
    measurementFrameRef.current = null;
    const pending = Array.from(pendingMeasurementsRef.current.entries());
    pendingMeasurementsRef.current.clear();

    for (const [node, observedSize] of pending) {
      const index = Number(node.dataset.index);
      if (!Number.isInteger(index) || measuredNodesRef.current.get(index) !== node || !node.isConnected) continue;
      const size = observedSize ?? node.getBoundingClientRect().height;
      if (Number.isFinite(size)) virtualizerRef.current.resizeItem(index, size);
    }
  }, []);

  const scheduleMeasurements = useCallback(() => {
    if (measurementFrameRef.current !== null) return;
    measurementFrameRef.current = window.requestAnimationFrame(flushMeasurements);
  }, [flushMeasurements]);

  const getMeasureRef = useCallback(
    (index: number) => {
      let callback = measureRefCallbacksRef.current.get(index);
      if (callback) return callback;

      callback = (node: HTMLDivElement | null) => {
        const previousNode = measuredNodesRef.current.get(index);
        if (previousNode && previousNode !== node) {
          measurementObserverRef.current?.unobserve(previousNode);
          pendingMeasurementsRef.current.delete(previousNode);
        }

        if (!node) {
          measuredNodesRef.current.delete(index);
          measuredPathsRef.current.delete(index);
          measureRefCallbacksRef.current.delete(index);
          return;
        }

        measuredNodesRef.current.set(index, node);
        measureRefCallbacksRef.current.set(index, callback!);
        measuredPathsRef.current.set(index, rowsRef.current[index]?.path);
        measurementObserverRef.current?.observe(node);
        pendingMeasurementsRef.current.set(node, null);
        scheduleMeasurements();
      };
      measureRefCallbacksRef.current.set(index, callback);
      return callback;
    },
    [scheduleMeasurements]
  );

  useLayoutEffect(() => {
    if (!multiline || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLDivElement;
        const borderSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
        const size = borderSize?.blockSize ?? entry.contentRect.height;
        pendingMeasurementsRef.current.set(node, size);
      }
      scheduleMeasurements();
    });
    measurementObserverRef.current = observer;

    for (const node of measuredNodesRef.current.values()) {
      observer.observe(node);
      pendingMeasurementsRef.current.set(node, null);
    }
    scheduleMeasurements();

    return () => {
      observer.disconnect();
      measurementObserverRef.current = null;
      pendingMeasurementsRef.current.clear();
      if (measurementFrameRef.current !== null) {
        window.cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
    };
  }, [multiline, scheduleMeasurements]);

  // A stable index slot keeps the same ref when a refresh changes its logical
  // path. Explicitly queue that slot so the new path receives its actual size.
  useLayoutEffect(() => {
    if (!multiline) return;
    let needsMeasurement = false;
    for (const [index, node] of measuredNodesRef.current) {
      const path = rows[index]?.path;
      if (measuredPathsRef.current.get(index) === path) continue;
      measuredPathsRef.current.set(index, path);
      pendingMeasurementsRef.current.set(node, null);
      needsMeasurement = true;
    }
    if (needsMeasurement) scheduleMeasurements();
  }, [rows, multiline, scheduleMeasurements]);

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
      ref={listRef}
      role="tree"
      style={{
        ...styles.treeViewOutline,
        ...(usesParentScroll
          ? // grows to content; the ancestor owns scrolling
            null
          : {
              ...(fill
                ? { flex: '1 1 0', minHeight: 0 }
                : { height: toCssSize(height), maxHeight: toCssSize(maxHeight) }),
              overflow: 'auto',
            }),
      }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TreeNode
              // Keyed by row INDEX, not path, so the DOM is recycled. Under
              // live refresh a structural change above the viewport (array
              // grew/shrank, key renamed) shifts which path sits at each
              // visible index; keying by path would unmount/remount every
              // shifted row each tick — thousands of detached DOM nodes per
              // second waiting for GC. With index keys the ~30 mounted rows
              // are stable slots whose content updates in place. TreeNode is
              // stateless, so reuse across different logical rows is safe.
              // (Height-measurement caching stays keyed by path via
              // getItemKey above — unaffected.)
              key={virtualRow.index}
              {...row}
              nodeRenderer={nodeRenderer}
              multiline={multiline}
              dataIndex={virtualRow.index}
              // In multiline mode the row height is measured from the DOM.
              measureRef={multiline ? getMeasureRef(virtualRow.index) : undefined}
              onClick={() => row.hasChildren && toggleExpand(row.path)}
              virtualStyle={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                // Fixed height only in single-line mode; multiline rows size to content.
                ...(multiline ? null : { height: rowHeight }),
                // `start` includes scrollMargin in 'parent' mode; positions here
                // are relative to the list itself.
                transform: `translateY(${virtualRow.start - (usesParentScroll ? scrollMargin : 0)}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
