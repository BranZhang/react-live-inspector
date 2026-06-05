# 计划：用 @tanstack/react-virtual 对 TreeView 做完全虚拟化

## 背景

`react-live-inspector` 是 `react-inspector` 的一个分支，针对 `data` 高频刷新场景做了优化。
路线图上剩余的一项是**大数据支持**：展开非常大的数组/对象（例如 10 万个节点）时，当前会把
所有可见节点都渲染到 DOM，从而卡死 UI（见 `stories/object-inspector.stories.jsx` →
`Perf - ~100k rendered nodes`）。

本次改动通过 `@tanstack/react-virtual` 引入**完全虚拟化**：无论节点数量多少，都只挂载
屏幕上可见的行。目标是尽量保持对外的组件 API（`ObjectInspector` / `DOMInspector` /
`Inspector` 的入参、`nodeRenderer` 契约、主题）行为一致；样式上的完全保真（例如长文本换行）
可以放宽。

### 已与用户确认的决策
1. **滚动策略：** 内部滚动容器 —— 新增 `height`/`maxHeight` 入参；组件自身拥有一个
   `overflow: auto` 的滚动区（出现内部滚动条可以接受）。
2. **启用方式：** 始终开启 —— 完全替换递归渲染，没有按节点数量的阈值，也没有 opt-in 开关。
3. **行高：** 固定估算行高（行强制单行显示）；长值的多行换行被有意舍弃。

## 核心架构变更

现状 `TreeView` 是**递归渲染**：`ConnectedTreeNode` 从 `ExpandedPathsContext` 读取展开状态，
展开时把 `dataIterator(data)` 映射成嵌套的 `<ConnectedTreeNode>`，放进嵌套的 `<ol>`；缩进
来自每层嵌套上的 `treeNodeChildNodesContainer.paddingLeft`
（`src/tree-view/TreeView.tsx`、`src/tree-view/TreeNode.tsx`）。

`@tanstack/react-virtual` 虚拟化的是**扁平列表**。因此我们：
1. **扁平化**：把当前可见的树展开成一个有序的行数组。
2. **虚拟化**：对该数组做虚拟化（固定 `estimateSize`）。
3. **渲染**：每行渲染为扁平元素，用 `paddingLeft = depth * TREENODE_PADDING_LEFT` 模拟缩进。

## 改动文件

### 1. `package.json` —— 新增运行时依赖
将 `@tanstack/react-virtual`（v3）加入 `dependencies`（不是 devDependencies —— 它在运行时
随包发布）。

### 2. `src/tree-view/flattenTree.ts`（新增）—— 扁平化辅助函数
纯函数，生成可见行列表。复用 `src/tree-view/pathUtils.ts` 中已有的 `hasChildNodes` 和
`DEFAULT_ROOT_PATH`，以及当前递归渲染使用的路径约定（`` `${path}.${name}` ``）。

行结构：`{ name, data, depth, path, expanded, hasChildren, ...iterator 额外属性 }`。
只遍历展开的子树，复杂度 O(可见节点数) —— 一个折叠的 10 万元素数组只贡献一行，这正是
“无论节点数量都完全虚拟化”可行的关键。

### 3. `src/tree-view/TreeView.tsx` —— 重写为 扁平化 + 虚拟化
- 保留 `useState({})` 展开状态，以及现有那个仅在 挂载 / `dataIterator|expandPaths|expandLevel`
  变化时 才应用 `getExpandedPaths(...)` 的 `useLayoutEffect`（保证“折叠状态在刷新下保持”
  的特性），**不要**改这些依赖。
- `rows = useMemo(() => flattenTree(name, data, dataIterator, expandedPaths), [...])`。
- `toggleExpand = useCallback(path => setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] })), [])`。
- 设置虚拟化器：`useVirtualizer({ count, getScrollElement, estimateSize: () => rowHeight,
  overscan, initialRect: { width: 0, height: numericHeight } })`。`initialRect` 用于在
  测量前（SSR / happy-dom 里 getBoundingClientRect 为 0）也能渲染出合理的可见窗口。
- 渲染：外层 `<div role="tree" overflow:auto height>`，内层 `<div height=totalSize
  position:relative>`，里面对 `getVirtualItems()` 逐行渲染 `<TreeNode>`，用
  `transform: translateY(start)` 绝对定位。
- **新增入参**（全部可选、增量；因为 `ObjectInspector`/`DOMInspector` 已经 spread
  `...treeViewProps`，会自动透传）：`height`（默认 `400`）、`maxHeight`、`rowHeight`
  （默认约 `16`）、`overscan`（默认 `20`）。
- 移除 `ConnectedTreeNode` 和 `ExpandedPathsContext` 的使用（状态现在集中在 `TreeView`，
  直接传给行，没有深层消费者了）。

### 4. `src/tree-view/TreeNode.tsx` —— 改为扁平单行
- 去掉嵌套的 `<ol role="group">{children}</ol>`；行不再渲染自己的子节点。
- 渲染一个 `<div role="treeitem">`（保留 `aria-expanded`；新增 `aria-level={depth+1}`
  以保持与旧嵌套结构等价的可访问性），内含：`paddingLeft: depth * TREENODE_PADDING_LEFT`，
  然后是现有的 `Arrow` / 占位逻辑（用 `hasChildren` 代替 `Children.count` 驱动），再是
  `<NodeRenderer {...props} />`。
- 加 `whiteSpace: 'nowrap'` 让行保持单行（固定行高对齐所必需）。合并传入的 `virtualStyle`
  做绝对定位。
- **保持 `nodeRenderer` 入参契约**：仍需收到
  `{ depth, name, data, isNonenumerable, expanded, path, ... }`，与现状一致
  （默认 renderer 依赖 `depth`/`name`/`data`）。
- DOM 闭合标签的缩进 hack（`htmlCloseTag.offsetLeft.marginLeft: -TREENODE_PADDING_LEFT`）
  仍可用，因为缩进仍以每行的左 padding/margin 表达。

### 5. `src/tree-view/ExpandedPathsContext.tsx` —— 删除
不再需要（`src/index.tsx` 没有导出它）。删除文件及其 import。

### 6. `src/object-inspector/ObjectInspector.tsx` 与 `src/dom-inspector/DOMInspector.tsx`
逻辑无变化 —— 两者已把未知 props 透传给 `TreeView`，所以 `height` 等会自动传过去。
（可选：扩展它们的 TS 类型声明。）

## 测试

- `src/object-inspector/ObjectInspector.spec.jsx` 及 `__snapshots__/` 下的快照：DOM 结构
  改变（扁平行 + 虚拟化包裹层），需重新生成快照（`yarn test -u`）并人工 review。
- **happy-dom 注意点：** happy-dom 里 `getBoundingClientRect` 返回 0 尺寸，若不处理虚拟化器
  会渲染 0 行、导致快照/查询失败。缓解：上面的 `initialRect` 高度会让首屏渲染出合理行集。
  验证现有的点击测试（展开一个 Map）仍能找到并切换某一行；必要时调整选择器。
- 新增 `src/tree-view/flattenTree.spec.ts`：断言顺序、depth、`hasChildren`，以及折叠节点
  不包含其后代。

## README

更新 `README.md` 路线图/About：把“大数据支持 … 虚拟化”标为已实现（✅），文档化新增的
`height`/`maxHeight`/`rowHeight`/`overscan` 入参，并说明单行（不换行）这一取舍。

## 端到端验证

1. `yarn test` —— 单测 + 重新生成的快照通过。
2. `yarn storybook`，检查：
   - `Perf - ~100k rendered nodes` —— 打开/滚动流畅（此前会卡死）；滚动时确认 DOM 里只有
     一小窗口的行。
   - `Perf - live refresh 10 Hz (~6.7k nodes)` —— 屏上 `<Profiler>` 显示 commit 时间在帧
     预算内。
   - `Verify - collapse persists under refresh` —— 折叠 `user`/`metrics`；刷新中保持折叠
     （解耦展开状态的特性无回归）。
   - 几个小 story（`Nested: Ice sculpture`、`Map: String keys`、DOM inspector story）——
     箭头、缩进、名称/值、展开/折叠显示正确。
3. `yarn build` —— tsup 构建成功，新依赖正确打包/外置。
4. `yarn lint`。
