/** Shapes of api/session/data/{ds}/connectionGroups/ROOT/tree. */
export interface GuacConnection {
  name: string;
  identifier: string;
  parentIdentifier?: string;
  protocol: string;
  activeConnections?: number;
}

export interface GuacGroup {
  name: string;
  identifier: string;
  parentIdentifier?: string;
  type: 'ORGANIZATIONAL' | 'BALANCING';
  activeConnections?: number;
  childConnectionGroups?: GuacGroup[];
  childConnections?: GuacConnection[];
}

/** A folder or something that can be opened in a tab. Balancing groups are
 *  connectable (Guacamole picks a member), so they are leaves here. */
export type TreeNode = FolderNode | ConnectionNode;

export interface FolderNode {
  kind: 'folder';
  key: string;
  name: string;
  children: TreeNode[];
}

export interface ConnectionNode {
  kind: 'connection';
  key: string;
  name: string;
  dataSource: string;
  identifier: string;
  /** GUAC_TYPE of the tunnel request: c = connection, g = balancing group. */
  type: 'c' | 'g';
  protocol: string;
  activeConnections: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function byName(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/** Children of ROOT for one data source, folders first, natural sort. */
export function buildTree(dataSource: string, root: GuacGroup): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const group of root.childConnectionGroups ?? []) {
    if (group.type === 'BALANCING') {
      nodes.push({
        kind: 'connection',
        key: `${dataSource}:g:${group.identifier}`,
        name: group.name,
        dataSource,
        identifier: group.identifier,
        type: 'g',
        protocol: 'balancing',
        activeConnections: group.activeConnections ?? 0,
      });
    } else {
      nodes.push({
        kind: 'folder',
        key: `${dataSource}:f:${group.identifier}`,
        name: group.name,
        children: buildTree(dataSource, group),
      });
    }
  }
  for (const connection of root.childConnections ?? []) {
    nodes.push({
      kind: 'connection',
      key: `${dataSource}:c:${connection.identifier}`,
      name: connection.name,
      dataSource,
      identifier: connection.identifier,
      type: 'c',
      protocol: connection.protocol,
      activeConnections: connection.activeConnections ?? 0,
    });
  }
  return nodes.sort(byName);
}

/** One tree across all data sources. A single non-empty source is shown
 *  flat; several get one top-level folder each. */
export function mergeDataSources(trees: { dataSource: string; nodes: TreeNode[] }[]): TreeNode[] {
  const nonEmpty = trees.filter((tree) => countConnections(tree.nodes) > 0);
  if (nonEmpty.length <= 1) return nonEmpty[0]?.nodes ?? [];
  return nonEmpty.map((tree) => ({
    kind: 'folder' as const,
    key: `${tree.dataSource}:root`,
    name: tree.dataSource,
    children: tree.nodes,
  }));
}

export function countConnections(nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.kind === 'folder' ? countConnections(node.children) : 1), 0);
}

/** Case-insensitive substring filter. A matching folder keeps its whole
 *  subtree; otherwise folders survive only with matching descendants. */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return nodes;
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const matches = node.name.toLocaleLowerCase().includes(needle);
    if (node.kind === 'connection') {
      if (matches) result.push(node);
    } else if (matches) {
      result.push(node);
    } else {
      const children = filterTree(node.children, needle);
      if (children.length) result.push({ ...node, children });
    }
  }
  return result;
}

export function folderKeys(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === 'folder' ? [node.key, ...folderKeys(node.children)] : []));
}

/** Depth-first list of the rows currently visible, for keyboard navigation. */
export function visibleRows(nodes: TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder' && expanded.has(node.key) ? [node, ...visibleRows(node.children, expanded)] : [node],
  );
}
