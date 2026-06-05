# react-live-inspector

[![build status](https://img.shields.io/travis/storybookjs/react-inspector/master.svg?style=flat-square)](https://travis-ci.org/storybookjs/react-inspector)
[![npm version](https://img.shields.io/npm/v/react-inspector.svg?style=flat-square)](https://www.npmjs.com/package/react-inspector)
[![npm downloads](https://img.shields.io/npm/dm/react-inspector.svg?style=flat-square)](https://www.npmjs.com/package/react-inspector)

Power of [Browser DevTools](https://developers.google.com/web/tools/chrome-devtools/) inspectors right inside your React app. Check out the [storybook](https://sb-react-inspector.netlify.app/) for a demo.

## About this fork

`react-live-inspector` is a fork of [`react-inspector`](https://github.com/storybookjs/react-inspector) (MIT), tuned for **scenarios where `data` refreshes at high frequency** (e.g. live/streaming previews). The upstream library re-renders the whole tree whenever the `data` reference changes and resets the user's expand/collapse state on every update, which becomes a performance and UX problem under continuous refresh.

This fork targets the following improvements. Status reflects what is actually implemented today:

1. **Expand/collapse state decoupled from `data`** — ✅ implemented. `expandLevel`/`expandPaths` are applied only on mount (and when those props change), not re-asserted on every `data` change, so refreshing the data no longer reopens nodes the user has collapsed. See the _"Verify - collapse persists under refresh"_ Storybook story.
2. **Node-level memoization + structural sharing** — ✅ implemented. Four pieces had to be fixed for memoization to actually take effect:
   - **Recursive-component memo bug (the critical one):** the recursive tree node was written as `const ConnectedTreeNode = memo(function ConnectedTreeNode(props) { … <ConnectedTreeNode/> … })`. A named function expression binds its own name inside its scope, so the recursive `<ConnectedTreeNode/>` resolved to the **raw, unmemoized inner function** instead of the `memo` wrapper — meaning *no child node was ever memoized* and the whole subtree re-rendered on every change. Fixed by naming the inner function differently so the recursive reference resolves to the memoized `const`.
   - Tree nodes are wrapped in `React.memo` and the `dataIterator` identity is stable across renders.
   - The `ExpandedPathsContext` value is memoized, so a data-only refresh no longer changes the context identity (previously a fresh array on every render force-re-rendered every consumer).
   - **Structural sharing** (`structuralSharing`, default `true`): each refresh, the incoming `data` is reconciled against the previous frame so subtrees that are *deeply equal* reuse the previous reference. This is what makes memoization effective in the common live case where every frame is a **brand-new object** (e.g. `JSON.parse` of a websocket payload) — without it, every node has a new reference and nothing can be skipped. One O(n) pass per refresh, far cheaper than re-rendering the tree. The win scales with how much is actually unchanged; truly changed subtrees still re-render.
3. **Safe "expand all"** — 🚧 planned. Avoid the upstream O(n²) cost of large `expandLevel` values.
4. **Large-data support** — 🚧 planned. Truncation/paging and/or virtualization so expanding very large arrays/objects does not freeze the UI. Not implemented yet.

> **The component API is kept fully compatible with `react-inspector`.** Existing props and components work unchanged — migration is a drop-in replacement.

![''](https://storybookjs.github.io/react-inspector/objectinspector.png)

![''](https://cldup.com/XhNGcBq9h2.png)

![''](https://storybookjs.github.io/react-inspector/tableinspector.png)

## Install

NPM:

```sh
npm install react-inspector
```

Recommended versions:

- version `3.0.2`: If you are using React 16.8.4 or later.
- version `2.3.1`: If you are using an earlier version of React.

## Getting started

### &lt;Inspector />

A shorthand for the inspectors.

- `<Inspector/>` is equivalent to `<ObjectInspector>` or `<DOMInspector>` if inspecting a DOM Node.
- `<Inspector table/>` is equivalent to `<TableInspector>`.

### &lt;ObjectInspector />

Like `console.log`. Consider this as a glorified version of `<pre>JSON.stringify(data, null, 2)</pre>`.

#### How it works

Tree state is saved at root. If you click to expand some elements in the hierarchy, the state will be preserved after the element is unmounted.

#### API

The component accepts the following props:

**`data: PropTypes.any`:** the Javascript object you would like to inspect

**`name: PropTypes.string`:** specify the optional name of the root node, default to `undefined`

**`expandLevel: PropTypes.number`:** an integer specifying to which level the tree should be initially expanded

**`expandPaths: PropTypes.oneOfType([PropTypes.string, PropTypes.array])`:** an array containing all the paths that should be expanded when the component is initialized, or a string of just one path

- The path string is similar to [JSONPath](https://goessner.net/articles/JsonPath/).
  - It is a dot separated string like `$.foo.bar`. `$.foo.bar` expands the path `$.foo.bar` where `$` refers to the root node. Note that it only expands that single node (but not all its parents and the root node). Instead, you should use `expandPaths={['$', '$.foo', '$.foo.bar']}` to expand all the way to the `$.foo.bar` node.
  - You can refer to array index paths using `['$', '$.1']`
  - You can use wildcard to expand all paths on a specific level
    - For example, to expand all first level and second level nodes, use `['$', '$.*']` (equivalent to `expandLevel={2}`)
- the results are merged with expandLevel

**`structuralSharing: PropTypes.bool`** (default `true`)**:** reconcile each new `data` against the previous frame so deeply-equal subtrees reuse the previous reference, letting `React.memo` skip unchanged nodes even when `data` is a brand-new object every refresh. Set to `false` to opt out (e.g. if your `data` already preserves references for unchanged subtrees, to skip the extra diff pass).

**`showNonenumerable: PropTypes.bool`:** show non-enumerable properties

**`sortObjectKeys: PropTypes.oneOfType([PropTypes.bool, PropTypes.func])`:** Sort object keys with optional compare function

When `sortObjectKeys={true}` is provided, keys of objects are sorted in alphabetical order except for arrays.

**`nodeRenderer: PropTypes.func`:** Use a custom `nodeRenderer` to render the object properties (optional)

- Instead of using the default `nodeRenderer`, you can provide a
  custom function for rendering object properties. The _default_
  nodeRender looks like this:

  ```js
  import { ObjectRootLabel, ObjectLabel } from 'react-inspector'

  const defaultNodeRenderer = ({ depth, name, data, isNonenumerable, expanded }) =>
    depth === 0
      ? <ObjectRootLabel name={name} data={data} />
      : <ObjectLabel name={name} data={data} isNonenumerable={isNonenumerable} />;
  ```

### &lt;TableInspector />

Like `console.table`.

#### API

The component accepts the following props:

**`data: PropTypes.oneOfType([PropTypes.array, PropTypes.object])`:** the Javascript object you would like to inspect, either an array or an object

**`columns: PropTypes.array`:** An array of the names of the columns you'd like to display in the table

### &lt;DOMInspector />

#### API

The component accepts the following props:

**`data: PropTypes.object`:** the DOM Node you would like to inspect

#### Usage

```js
import { ObjectInspector, TableInspector } from 'react-inspector';

// or use the shorthand
import { Inspector } from 'react-inspector';

const MyComponent = ({ data }) =>
  <div>
    <ObjectInspector data={data} />
    <TableInspector data={data} />

    <Inspector data={data} />
    <Inspector table data={data} />
  </div>

let data = { /* ... */ };

ReactDOM.render(
  <MyComponent data={data} />,
  document.getElementById('root')
);
```

Try embedding the inspectors inside a component's render() method to provide a live view for its props/state (Works even better with hot reloading).

### More Examples

Check out the storybook for more examples.

```sh
npm install && npm run storybook
```

Open [http://localhost:9001/](http://localhost:9001/)

## Theme

By specifying the `theme` prop you can customize the inspectors. `theme` prop can be

1. a string referring to a preset theme (`"chromeLight"` or `"chromeDark"`, default to `"chromeLight"`)
2. or a custom object that provides the necessary variables. Checkout [`src/styles/themes`](https://github.com/storybookjs/react-inspector/tree/master/src/styles/themes) for possible theme variables.

**Example 1:** Using a preset theme:

```js
<Inspector theme="chromeDark" data={{a: 'a', b: 'b'}}/>
```

**Example 2:** changing the tree node indentation by inheriting the chrome light theme:

```js
import { chromeLight } from 'react-inspector'

<Inspector theme={{...chromeLight, ...({ TREENODE_PADDING_LEFT: 20 })}} data={{a: 'a', b: 'b'}}/>
```

## Roadmap

Type of inspectors:

- [x] Tree style
  - [x] common objects
  - [x] DOM nodes
- [x] Table style
  - [ ] Column resizer
- [ ] Group style

Performance (this fork):

- [x] Expand/collapse state decoupled from `data`
- [x] Stable `dataIterator` identity (prerequisite for memoization)
- [x] Memoized `ExpandedPathsContext` value (data refresh no longer re-renders all nodes)
- [x] Node-level memoization (effective for unchanged-reference subtrees)
- [x] Structural sharing (memoization works even when each frame is a brand-new object)
- [ ] Viewport-gated rendering (freeze off-screen nodes under high-frequency refresh)
- [ ] Safe "expand all" for large `expandLevel`
- [ ] Large-data support (truncation/paging and/or virtualization)

## Contribution

Contribution is welcome. [Past contributors](https://github.com/storybookjs/react-inspector/graphs/contributors)

## Additional

- If you intend to capture `console.log`s, you may want to look at [`console-feed`](https://www.npmjs.com/package/console-feed).
- `react-object-inspector` package will be deprecated. `<ObjectInspector/>` is now part of the new package `react-inspector`.
- Why inline style? [This document](https://github.com/erikras/react-redux-universal-hot-example/blob/master/docs/InlineStyles.md) summarizes it well.
