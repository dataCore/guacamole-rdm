import { describe, expect, it } from 'vitest';
import { buildTree, filterTree, folderKeys, mergeDataSources, visibleRows, type GuacGroup } from './tree';

const root: GuacGroup = {
  name: 'ROOT',
  identifier: 'ROOT',
  type: 'ORGANIZATIONAL',
  childConnectionGroups: [
    {
      name: 'SiteB',
      identifier: '2',
      type: 'ORGANIZATIONAL',
      childConnections: [{ name: 'web01', identifier: '20', protocol: 'ssh' }],
    },
    {
      name: 'SiteA',
      identifier: '1',
      type: 'ORGANIZATIONAL',
      childConnectionGroups: [{ name: 'Pool', identifier: '3', type: 'BALANCING', activeConnections: 2 }],
      childConnections: [
        { name: 'host10', identifier: '11', protocol: 'rdp' },
        { name: 'host9', identifier: '10', protocol: 'rdp', activeConnections: 1 },
      ],
    },
  ],
  childConnections: [{ name: 'alpha', identifier: '30', protocol: 'vnc' }],
};

describe('buildTree', () => {
  const nodes = buildTree('postgresql', root);

  it('puts folders before connections and sorts naturally', () => {
    expect(nodes.map((node) => node.name)).toEqual(['SiteA', 'SiteB', 'alpha']);
    const siteA = nodes[0];
    expect(siteA.kind === 'folder' && siteA.children.map((node) => node.name)).toEqual(['host9', 'host10', 'Pool']);
  });

  it('turns balancing groups into connectable leaves with GUAC_TYPE g', () => {
    const siteA = nodes[0];
    const pool = siteA.kind === 'folder' ? siteA.children.find((node) => node.name === 'Pool') : undefined;
    expect(pool).toMatchObject({ kind: 'connection', type: 'g', identifier: '3', activeConnections: 2 });
  });

  it('builds keys unique across data sources and kinds', () => {
    expect(nodes.find((node) => node.name === 'alpha')?.key).toBe('postgresql:c:30');
    expect(nodes[0].key).toBe('postgresql:f:1');
  });
});

describe('mergeDataSources', () => {
  const nodes = buildTree('postgresql', root);

  it('shows a single non-empty source flat and drops empty ones', () => {
    const merged = mergeDataSources([
      { dataSource: 'postgresql', nodes },
      { dataSource: 'postgresql-shared', nodes: [] },
    ]);
    expect(merged).toBe(nodes);
  });

  it('wraps each source in a folder when several have connections', () => {
    const merged = mergeDataSources([
      { dataSource: 'postgresql', nodes },
      { dataSource: 'ldap', nodes: buildTree('ldap', root) },
    ]);
    expect(merged.map((node) => node.name)).toEqual(['postgresql', 'ldap']);
  });
});

describe('filterTree', () => {
  const nodes = buildTree('postgresql', root);

  it('keeps the path to matching connections only', () => {
    const result = filterTree(nodes, 'HOST1');
    expect(result.map((node) => node.name)).toEqual(['SiteA']);
    const siteA = result[0];
    expect(siteA.kind === 'folder' && siteA.children.map((node) => node.name)).toEqual(['host10']);
  });

  it('keeps the whole subtree of a matching folder', () => {
    const siteB = filterTree(nodes, 'siteb')[0];
    expect(siteB.kind === 'folder' && siteB.children).toHaveLength(1);
  });

  it('returns the input untouched for an empty query', () => {
    expect(filterTree(nodes, '  ')).toBe(nodes);
  });
});

describe('visibleRows', () => {
  it('lists children of expanded folders only', () => {
    const nodes = buildTree('postgresql', root);
    expect(visibleRows(nodes, new Set()).map((node) => node.name)).toEqual(['SiteA', 'SiteB', 'alpha']);
    expect(visibleRows(nodes, new Set(['postgresql:f:2'])).map((node) => node.name)).toEqual([
      'SiteA',
      'SiteB',
      'web01',
      'alpha',
    ]);
    expect(folderKeys(nodes)).toEqual(['postgresql:f:1', 'postgresql:f:2']);
  });
});
