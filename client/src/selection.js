import { zoneContents } from './zones.js';

export const NOTHING = Object.freeze({ node: new Set(), zone: new Set(), connector: new Set() });

const same = (a, b) => a.type === b.type && a.id === b.id;
const LISTS = { node: 'nodes', zone: 'zones', connector: 'connectors' };

export function pickedOf(refs) {
  const out = { node: new Set(), zone: new Set(), connector: new Set() };
  for (const r of refs) out[r.type]?.add(r.id);
  return out;
}

// `selection` is the one the panel shows when a single thing is chosen (and the last one added to a group); `multi` is the whole group, only filled from two up.
export function selectionState(refs) {
  const unique = refs.filter((r, i) => refs.findIndex((o) => same(o, r)) === i);
  if (!unique.length) return { selection: null, multi: [], picked: NOTHING };
  return { selection: unique[unique.length - 1], multi: unique.length > 1 ? unique : [], picked: pickedOf(unique) };
}

export const refsOf = (s) => (s.multi.length ? s.multi : s.selection ? [s.selection] : []);

export const toggled = (refs, ref) => (refs.some((r) => same(r, ref)) ? refs.filter((r) => !same(r, ref)) : [...refs, ref]);

export const pruned = (refs, data) => refs.filter((r) => data[LISTS[r.type]]?.some((x) => x.id === r.id));

export function everything(data) {
  return [
    ...data.nodes.map((n) => ({ type: 'node', id: n.id })),
    ...data.zones.map((z) => ({ type: 'zone', id: z.id })),
    ...data.connectors.map((c) => ({ type: 'connector', id: c.id })),
  ];
}

// What moves when a group is dragged: the group itself and whatever sits inside its zones, each only once.
export function groupContents(data, picked) {
  const nodes = new Set(picked.node);
  const zones = new Set(picked.zone);
  for (const id of picked.zone) {
    const zone = data.zones.find((z) => z.id === id);
    if (!zone) continue;
    const inside = zoneContents(zone, data);
    for (const n of inside.nodes) nodes.add(n);
    for (const z of inside.zones) zones.add(z);
  }
  return { nodes, zones };
}

// Everything whose place on screen falls inside the rectangle: nodes by their centre, zones when all four corners are in, and the
// connectors that join two chosen nodes. `project(x, y, z)` gives the screen position.
export function rectPick(data, project, rect) {
  const inside = ([x, y]) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const nodes = data.nodes.filter((n) => inside(project(n.position[0], 0.3, n.position[2])));
  const zones = data.zones.filter((z) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inside(project(z.position[0] + (a * z.size[0]) / 2, -0.5, z.position[2] + (b * z.size[2]) / 2))));
  const ids = new Set(nodes.map((n) => n.id));
  const links = data.connectors.filter((c) => ids.has(c.from) && ids.has(c.to));
  return [
    ...nodes.map((n) => ({ type: 'node', id: n.id })),
    ...zones.map((z) => ({ type: 'zone', id: z.id })),
    ...links.map((c) => ({ type: 'connector', id: c.id })),
  ];
}

export function summary(picked) {
  const part = (n, one, many) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
  return [...part(picked.node.size, 'node', 'nodes'), ...part(picked.zone.size, 'zone', 'zones'), ...part(picked.connector.size, 'connection', 'connections')].join(' · ');
}

// The value every chosen thing shares, or null when they differ.
export function shared(items, key) {
  if (!items.length) return null;
  const first = items[0][key];
  return items.every((i) => i[key] === first) ? first ?? null : null;
}
