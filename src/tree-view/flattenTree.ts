import { DEFAULT_ROOT_PATH, hasChildNodes } from './pathUtils';

export interface FlatTreeRow {
  name: any;
  data: any;
  depth: number;
  path: string;
  expanded: boolean;
  hasChildren: boolean;
  // any extra props yielded by the iterator (e.g. isNonenumerable, isCloseTag)
  [key: string]: any;
}

/**
 * Flatten the currently-visible tree into an ordered list of rows for
 * virtualization. Only expanded subtrees are walked, so the cost is
 * O(visible nodes) — a collapsed 100k-element array contributes a single row.
 *
 * Each row carries everything a flat <TreeNode> needs to render itself without
 * recursion. The path convention (`${path}.${name}`) matches the recursive
 * renderer so expand/collapse state keyed by path stays compatible.
 */
export function flattenTree(
  name: any,
  data: any,
  dataIterator: (data: any) => Iterable<any>,
  expandedPaths: Record<string, boolean>
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  const walk = (name: any, data: any, depth: number, path: string, extra: Record<string, any>) => {
    const hasChildren = hasChildNodes(data, dataIterator);
    const expanded = hasChildren && !!expandedPaths[path];

    rows.push({ name, data, depth, path, expanded, hasChildren, ...extra });

    if (expanded) {
      for (const { name: childName, data: childData, ...rest } of dataIterator(data)) {
        walk(childName, childData, depth + 1, `${path}.${childName}`, rest);
      }
    }
  };

  walk(name, data, 0, DEFAULT_ROOT_PATH, {});

  return rows;
}
