export const DEFAULT_ROOT_PATH = '$';

const WILDCARD = '*';

export function hasChildNodes(data, dataIterator) {
  return !dataIterator(data).next().done;
}

export const wildcardPathsFromLevel = (level) => {
  // i is depth
  return Array.from({ length: level }, (_, i) =>
    [DEFAULT_ROOT_PATH].concat(Array.from({ length: i }, () => '*')).join('.')
  );
};

export const getExpandedPaths = (data, dataIterator, expandPaths, expandLevel, prevExpandedPaths) => {
  const expandedPaths: string[] = [];

  // Safe "expand all": expand every node up to `expandLevel` in a single
  // bounded tree walk. The upstream approach builds one wildcard pattern per
  // level ($, $.*, $.*.*, …) and re-walks the tree from the root for each,
  // which is O(level × n) — quadratic for a fully-expanded deep tree. Walking
  // once and stopping at `expandLevel` visits each in-range node exactly once.
  if (expandLevel > 0) {
    const walkLevel = (curData, curPath, depth) => {
      if (depth >= expandLevel || !hasChildNodes(curData, dataIterator)) {
        return;
      }
      expandedPaths.push(curPath);
      for (const { name, data: childData } of dataIterator(curData)) {
        walkLevel(childData, `${curPath}.${name}`, depth + 1);
      }
    };
    walkLevel(data, DEFAULT_ROOT_PATH, 0);
  }

  // Explicit expandPaths (may contain wildcards) are typically few and short,
  // so the per-path walk below is fine for them.
  const wildcardPaths: string[] = ([] as string[]).concat(expandPaths).filter((path) => typeof path === 'string'); // could be undefined

  wildcardPaths.forEach((wildcardPath) => {
    const keyPaths = wildcardPath.split('.');
    const populatePaths = (curData, curPath, depth) => {
      if (depth === keyPaths.length) {
        expandedPaths.push(curPath);
        return;
      }
      const key = keyPaths[depth];
      if (depth === 0) {
        if (hasChildNodes(curData, dataIterator) && (key === DEFAULT_ROOT_PATH || key === WILDCARD)) {
          populatePaths(curData, DEFAULT_ROOT_PATH, depth + 1);
        }
      } else {
        if (key === WILDCARD) {
          for (const { name, data } of dataIterator(curData)) {
            if (hasChildNodes(data, dataIterator)) {
              populatePaths(data, `${curPath}.${name}`, depth + 1);
            }
          }
        } else {
          const value = curData[key];
          if (hasChildNodes(value, dataIterator)) {
            populatePaths(value, `${curPath}.${key}`, depth + 1);
          }
        }
      }
    };

    populatePaths(data, '', 0);
  });

  return expandedPaths.reduce(
    (obj, path) => {
      obj[path] = true;
      return obj;
    },
    { ...prevExpandedPaths }
  );
};
