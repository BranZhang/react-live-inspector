import React, { useContext, useCallback, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { ExpandedPathsContext } from './ExpandedPathsContext';
import { TreeNode } from './TreeNode';
import { DEFAULT_ROOT_PATH, hasChildNodes, getExpandedPaths } from './pathUtils';

import { useStyles } from '../styles';

// NOTE: the inner function is intentionally named `ConnectedTreeNodeImpl`, not
// `ConnectedTreeNode`. A named function expression binds its own name in its
// scope, which would SHADOW the outer `const ConnectedTreeNode` (the memoized
// wrapper). The recursive `<ConnectedTreeNode/>` below must resolve to the
// memoized const — if it resolved to the raw inner function, every child node
// would render UNMEMOIZED and `React.memo` (plus structural sharing) would have
// no effect at all.
const ConnectedTreeNode = memo(function ConnectedTreeNodeImpl(props: Record<string, any>) {
  const { data, dataIterator, path, depth, nodeRenderer } = props;
  const [expandedPaths, setExpandedPaths] = useContext(ExpandedPathsContext);
  const nodeHasChildNodes = hasChildNodes(data, dataIterator);
  const expanded = !!expandedPaths[path];

  const handleClick = useCallback(
    () =>
      nodeHasChildNodes &&
      setExpandedPaths((prevExpandedPaths) => ({
        ...prevExpandedPaths,
        [path]: !expanded,
      })),
    [nodeHasChildNodes, setExpandedPaths, path, expanded]
  );

  return (
    <TreeNode
      expanded={expanded}
      onClick={handleClick}
      // show arrow anyway even if not expanded and not rendering children
      shouldShowArrow={nodeHasChildNodes}
      // show placeholder only for non root nodes
      shouldShowPlaceholder={depth > 0}
      // Render a node from name and data (or possibly other props like isNonenumerable)
      nodeRenderer={nodeRenderer}
      {...props}>
      {
        // only render if the node is expanded
        expanded
          ? [...dataIterator(data)].map(({ name, data, ...renderNodeProps }) => {
              return (
                <ConnectedTreeNode
                  name={name}
                  data={data}
                  depth={depth + 1}
                  path={`${path}.${name}`}
                  key={name}
                  dataIterator={dataIterator}
                  nodeRenderer={nodeRenderer}
                  {...renderNodeProps}
                />
              );
            })
          : null
      }
    </TreeNode>
  );
});

// ConnectedTreeNode.propTypes = {
//   name: PropTypes.string,
//   data: PropTypes.any,
//   dataIterator: PropTypes.func,
//   depth: PropTypes.number,
//   expanded: PropTypes.bool,
//   nodeRenderer: PropTypes.func,
// };

export const TreeView = memo(function TreeView({
  name,
  data,
  dataIterator,
  nodeRenderer,
  expandPaths,
  expandLevel,
}: Record<string, any>) {
  const styles = useStyles('TreeView');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // Stabilize the context value so it only changes when `expandedPaths` actually
  // changes (a user expand/collapse) — NOT on every render. `useState` returns a
  // fresh `[state, setter]` array each render; passing that straight into the
  // Provider made the context value identity change on every `data` tick, which
  // force-re-renders ALL context consumers and defeats `React.memo` on the nodes.
  // With this memo, a data-only refresh leaves the context value untouched, so
  // memoized subtrees whose `data` reference is unchanged are skipped.
  const contextValue = useMemo<[Record<string, boolean>, typeof setExpandedPaths]>(
    () => [expandedPaths, setExpandedPaths],
    [expandedPaths]
  );

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

  return (
    <ExpandedPathsContext.Provider value={contextValue}>
      <ol role="tree" style={styles.treeViewOutline}>
        <ConnectedTreeNode
          name={name}
          data={data}
          dataIterator={dataIterator}
          depth={0}
          path={DEFAULT_ROOT_PATH}
          nodeRenderer={nodeRenderer}
        />
      </ol>
    </ExpandedPathsContext.Provider>
  );
});

// TreeView.propTypes = {
//   name: PropTypes.string,
//   data: PropTypes.any,
//   dataIterator: PropTypes.func,
//   nodeRenderer: PropTypes.func,
//   expandPaths: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
//   expandLevel: PropTypes.number,
// };
