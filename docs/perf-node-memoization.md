# Node-level memoization + structural sharing

Status: implemented on branch `perf/node-memoization-structural-sharing`. **Not merged to `main`** — kept for review.

This document explains what problem this branch addresses, how it was diagnosed,
the design of the fix, and the measured results.

## 1. The problem

`react-live-inspector` is tuned for **high-frequency `data` refresh** (live /
streaming previews). The target roadmap item #2 was "node-level memoization":
when the data refreshes, tree nodes whose value did not change should not
re-render.

In practice this delivered **nothing**. Even after wrapping nodes in
`React.memo`, stabilizing the `dataIterator` identity, and memoizing the
`ExpandedPathsContext` value, a refresh still re-rendered the entire visible
tree. A benchmark that feeds a fresh object every frame but only changes ~1/3 of
the leaves showed **identical** render counts with and without optimization.

Two compounding facts made this the worst case for reference-equality memo:

1. In real usage every frame's `data` is a **brand-new object** (e.g.
   `JSON.parse` of a websocket payload), so every node has a new reference and
   `React.memo` (which compares by reference) can never trivially skip a node.
2. Something was defeating memoization even for subtrees whose reference *was*
   stable.

## 2. Diagnosis

Diagnosis was done by bisecting with minimal reproductions (render-counting
`nodeRenderer`s and standalone `React.memo` test cases). The key observations:

- With an **identical** root `data` reference, the whole tree was skipped (0
  renders) — so `React.memo` worked at the root.
- With a **partially-changed** tree (sibling changes, one subtree reference
  stable), the stable subtree still re-rendered — and crucially, the custom
  `memo` comparator was **never invoked** for any non-root node. Mount/unmount
  effects did not fire, so it was not a remount.
- A flat `.map` of memo children bailed correctly. A **recursive** memo
  component (a node that renders nodes) did not.
- Splitting the recursive node into two distinct-but-identical memo components
  (passing the child component via prop) made it bail correctly.

That last step isolated the root cause.

### Root cause: named-function-expression shadowing

The recursive tree node was written as:

```js
const ConnectedTreeNode = memo(function ConnectedTreeNode(props) {
  // ...
  return <TreeNode>{children.map(() => <ConnectedTreeNode .../>)}</TreeNode>;
});
```

A **named function expression** binds its own name inside its own scope. So the
recursive `<ConnectedTreeNode/>` did **not** resolve to the outer
`const ConnectedTreeNode` (the `memo` wrapper) — it resolved to the **raw,
unmemoized inner function**. Every child node was therefore rendered without any
memoization. `React.memo`, the stable `dataIterator`, and structural sharing
were all silently architected around, because no child was ever a memo element.

This single bug is why roadmap item #2 appeared "done" in code but had no effect.

## 3. Design of the fix

Four changes, in order of importance:

1. **Un-shadow the recursive component** (`src/tree-view/TreeView.tsx`).
   Rename the inner function so the recursive reference resolves to the memoized
   const:

   ```js
   const ConnectedTreeNode = memo(function ConnectedTreeNodeImpl(props) {
     // ... <ConnectedTreeNode/> now refers to the memo wrapper
   });
   ```

   This is the change that actually turns memoization on.

2. **Memoize the `ExpandedPathsContext` value** (`src/tree-view/TreeView.tsx`).
   `useState` returns a fresh `[state, setter]` array each render; passing it
   straight into the Provider changed the context identity on every data tick,
   which force-re-renders every consumer regardless of `memo`. The value is now
   `useMemo`-ed on `[expandedPaths]`, so a data-only refresh leaves the context
   identity stable.

3. **Structural sharing** (`src/utils/structuralSharing.ts`,
   `replaceEqualDeep`). Reference-equality memo is useless when every frame is a
   new object. Before the data reaches the tree, it is reconciled against the
   previous frame: any subtree that is **deeply equal** reuses the previous
   reference, so unchanged subtrees keep a stable identity and `React.memo`
   skips them; changed paths get fresh objects and re-render. This is one O(n)
   pass per refresh — far cheaper than re-rendering the tree. Only plain arrays
   and plain objects are descended into; class instances, Maps, DOM nodes, etc.
   are compared by reference to avoid walking exotic/host objects. (Same idea as
   react-query's `replaceEqualDeep`.)

   It is wired in at the `ObjectInspector` boundary (top of the tree, where the
   previous frame is held in a ref), **not** inside the node components — the
   reconciliation is a tree-global operation that needs both the previous and
   next whole tree. It is exposed as a prop:

   - `structuralSharing` (default `true`) — set to `false` to opt out (e.g. if
     your `data` already preserves references for unchanged subtrees).

4. **Stable `dataIterator` identity** (pre-existing, retained). The iterator is
   `useMemo`-ed so it does not re-trigger the expand effect or change node props
   each render.

### A consumer footgun worth noting

For memoization to hold end-to-end, the **`nodeRenderer` must be a stable
reference** (e.g. wrapped in `useCallback`). An inline
`nodeRenderer={(p) => ...}` is a new function every render and flows into every
node's props, defeating `memo` for all nodes. Custom `nodeRenderer`s should also
be pure functions of their props, since memoized nodes are not re-invoked while
their data is unchanged.

## 4. Results

Benchmark (`src/object-inspector/structuralSharing.bench.spec.jsx`): a fresh
object every frame, ~1/3 of leaves changing, measuring node renders on a single
refresh.

| Scenario                       | Node renders on refresh |
| ------------------------------ | ----------------------- |
| structural sharing **OFF**     | 145                     |
| structural sharing **ON**      | **79**                  |

~45% fewer node renders. The remaining renders are the genuinely-changed leaves
plus their ancestor "spine" to the root (a changed leaf forces its ancestor
chain to re-render, but sibling subtrees are skipped). The benefit scales with
how much of the data is actually unchanged between frames.

Storybook has matching demos under "Object Inspector":

- `Perf - partial refresh, structural sharing ON`
- `Perf - partial refresh, structural sharing OFF (baseline)`

A React `<Profiler>` overlay reports commit durations live.

### What this does NOT fix

- A node whose value object is genuinely recreated each tick (new reference,
  changed value) still re-renders — that is unavoidable with value-changing
  data.
- The all-changing worst case (e.g. the existing
  `Perf - live refresh 10 Hz (~6.7k nodes)` story, where every leaf changes
  every tick) sees little benefit, because there is nothing unchanged to skip.
- Very large fully-expanded trees still mount a large DOM. Bounding *that* needs
  viewport-gated rendering / virtualization (roadmap item #4), which is
  complementary to this work and intentionally out of scope here.

## 5. Files changed

- `src/tree-view/TreeView.tsx` — un-shadow recursive node; memoize context value.
- `src/utils/structuralSharing.ts` (+ `.spec`) — `replaceEqualDeep`.
- `src/object-inspector/ObjectInspector.tsx` — wire structural sharing; add
  `structuralSharing` prop.
- `src/object-inspector/structuralSharing.bench.spec.jsx` — render-count
  regression benchmark.
- `stories/object-inspector.stories.jsx` — partial-refresh ON/OFF demos.
- `README.md` — roadmap + prop docs.
