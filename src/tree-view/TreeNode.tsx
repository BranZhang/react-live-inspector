import React, { FC, memo } from 'react';
import { useStyles } from '../styles';

const Arrow: FC<any> = ({ expanded, styles }) => (
  <span
    style={{
      ...styles.base,
      ...(expanded ? styles.expanded : styles.collapsed),
    }}>
    ▶
  </span>
);

export const TreeNode: FC<any> = memo((props) => {
  props = {
    expanded: true,
    nodeRenderer: ({ name }: any) => <span>{name}</span>,
    onClick: () => {},
    hasChildren: false,
    depth: 0,
    ...props,
  };
  const { expanded, onClick, nodeRenderer, title, hasChildren, depth, virtualStyle } = props;

  const styles = useStyles('TreeNode');
  const NodeRenderer = nodeRenderer;

  // Indentation is per-level left padding (one level == TREENODE_PADDING_LEFT),
  // simulating the nested <ol> padding of the old recursive renderer.
  const paddingLeft = (styles.treeNodeChildNodesContainer.paddingLeft as number) * depth;

  // show arrow when the node has children; otherwise reserve the arrow's space
  // with a placeholder for non-root nodes (depth > 0).
  const showPlaceholder = !hasChildren && depth > 0;

  return (
    <div
      aria-expanded={hasChildren ? expanded : undefined}
      aria-level={depth + 1}
      role="treeitem"
      title={title}
      style={{
        ...styles.treeNodeBase,
        whiteSpace: 'nowrap',
        ...virtualStyle,
      }}>
      <div style={{ ...styles.treeNodePreviewContainer, paddingLeft }} onClick={onClick}>
        {hasChildren ? (
          <Arrow expanded={expanded} styles={styles.treeNodeArrow} />
        ) : (
          showPlaceholder && <span style={styles.treeNodePlaceholder}>&nbsp;</span>
        )}
        <NodeRenderer {...props} />
      </div>
    </div>
  );
});
