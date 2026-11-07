import { inZone, zoneContents } from './zones.js';
import { uid } from './model.js';
import { attachedToAny, freeLabelsIn, placeOf } from './textLabels.js';

// What gets copied:
//  - a node: just the node
//  - a zone: the zone, every node inside it, every connector between those nodes, and any zone that lies wholly
//    inside it, all keeping their distances to each other (everything is stored with its original position).
// `anchor` is the point that follows the mouse: the node's square, or the zone's centre.
export function buildClip(data, sel) {
  if (Array.isArray(sel)) return sel.length === 1 ? buildClip(data, sel[0]) : buildGroupClip(data, sel);
  if (sel?.type === 'node') {
    const n = data.nodes.find((x) => x.id === sel.id);
    return n && { type: 'node', anchor: [n.position[0], n.position[2]], main: n, nodes: [structuredClone(n)], zones: [], labels: structuredClone((data.labels ?? []).filter((l) => l.attach?.type === 'node' && l.attach.id === n.id)), connectors: [], pasted: 0 };
  }
  if (sel?.type === 'label') {
    const l = (data.labels ?? []).find((x) => x.id === sel.id);
    return l && { type: 'label', anchor: placeOf(l, data).map(Math.round), main: l, nodes: [], zones: [], labels: [structuredClone(l)], connectors: [], pasted: 0 };
  }
  if (sel?.type === 'zone') {
    const z = data.zones.find((x) => x.id === sel.id);
    if (!z) return null;
    const inside = data.nodes.filter((n) => inZone(z, n));
    const ids = new Set(inside.map((n) => n.id));
    const within = (o) => Math.abs(o.position[0] - z.position[0]) + o.size[0] / 2 <= z.size[0] / 2 && Math.abs(o.position[2] - z.position[2]) + o.size[2] / 2 <= z.size[2] / 2;
    const nested = data.zones.filter((o) => o.id !== z.id && within(o));
    const zoneIds = new Set([z.id, ...nested.map((o) => o.id)]);
    const texts = (data.labels ?? []).filter((l) => (!l.attach && freeLabelsIn(z, [l]).length) || attachedToAny(l, ids, zoneIds));
    return {
      type: 'zone', anchor: [z.position[0], z.position[2]], main: z,
      nodes: structuredClone(inside), zones: [structuredClone(z), ...structuredClone(nested)], labels: structuredClone(texts),
      connectors: structuredClone(data.connectors.filter((c) => ids.has(c.from) && ids.has(c.to))), pasted: 0,
    };
  }
  return null;
}

// Several things at once: the chosen nodes and zones, whatever sits inside the chosen zones, and the connectors between all of those.
function buildGroupClip(data, refs) {
  const nodeIds = new Set(refs.filter((r) => r.type === 'node').map((r) => r.id));
  const zoneIds = new Set(refs.filter((r) => r.type === 'zone').map((r) => r.id));
  const labelIds = new Set(refs.filter((r) => r.type === 'label').map((r) => r.id));
  for (const id of [...zoneIds]) {
    const z = data.zones.find((x) => x.id === id);
    if (!z) continue;
    const inside = zoneContents(z, data);
    inside.nodes.forEach((n) => nodeIds.add(n));
    inside.zones.forEach((o) => zoneIds.add(o));
    inside.labels.forEach((l) => labelIds.add(l));
  }
  const nodes = data.nodes.filter((n) => nodeIds.has(n.id));
  const zones = data.zones.filter((z) => zoneIds.has(z.id));
  const texts = (data.labels ?? []).filter((l) => labelIds.has(l.id) || attachedToAny(l, nodeIds, zoneIds));
  if (!nodes.length && !zones.length && !texts.length) return null;
  const spots = texts.map((l) => placeOf(l, data));
  const xs = [...nodes.map((n) => n.position[0]), ...zones.flatMap((z) => [z.position[0] - z.size[0] / 2, z.position[0] + z.size[0] / 2]), ...spots.map((p) => p[0])];
  const zs = [...nodes.map((n) => n.position[2]), ...zones.flatMap((z) => [z.position[2] - z.size[2] / 2, z.position[2] + z.size[2] / 2]), ...spots.map((p) => p[1])];
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return {
    type: 'group', anchor: [Math.round((x0 + x1) / 2), Math.round((z0 + z1) / 2)], span: [x1 - x0, z1 - z0],
    main: { label: `${nodes.length + zones.length + texts.length} items` },
    nodes: structuredClone(nodes), zones: structuredClone(zones), labels: structuredClone(texts),
    connectors: structuredClone(data.connectors.filter((c) => nodeIds.has(c.from) && nodeIds.has(c.to))), pasted: 0,
  };
}

// Where the anchor lands when the mouse is over grid square (x, z): a zone's centre sits on a half square when its
// size is even, so its edges stay on grid lines.
export function snapAnchor(clip, x, z) {
  if (clip.type !== 'zone') return [x, z];
  const off = (i) => (clip.main.size[i] % 2 === 0 ? 0.5 : 0);
  return [Math.round(x - off(0)) + off(0), Math.round(z - off(2)) + off(2)];
}

const cell = (x, z) => `${x},${z}`;

// The offset (dx, dz) nearest to the wanted one at which none of the pasted nodes lands on an existing node.
export function freeOffset(clip, existing, dx, dz) {
  const taken = new Set(existing.map((n) => cell(n.position[0], n.position[2])));
  const fits = (ox, oz) => clip.nodes.every((n) => !taken.has(cell(n.position[0] + ox, n.position[2] + oz)));
  for (let r = 0; r < 40; r++) {
    const ring = [];
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.max(Math.abs(a), Math.abs(b)) === r) ring.push([dx + a, dz + b]);
    ring.sort((p, q) => Math.hypot(p[0] - dx, p[1] - dz) - Math.hypot(q[0] - dx, q[1] - dz) || p[1] - q[1]);
    const ok = ring.find(([ox, oz]) => fits(ox, oz));
    if (ok) return ok;
  }
  return [dx, dz];
}

// Fresh copies (new ids, connectors and attached text re-pointed at the new things) shifted by (dx, dz). Text attached to something that was not
// copied stays attached to the original and moves with the paste, so it lands where it would have if it were free.
export function materialize(clip, dx, dz) {
  const idMap = new Map(), zoneMap = new Map();
  const nodes = clip.nodes.map((n) => { const id = uid(); idMap.set(n.id, id); return { ...structuredClone(n), id, position: [n.position[0] + dx, n.position[1], n.position[2] + dz] }; });
  const zones = clip.zones.map((z) => { const id = uid(); zoneMap.set(z.id, id); return { ...structuredClone(z), id, position: [z.position[0] + dx, z.position[1], z.position[2] + dz] }; });
  const connectors = clip.connectors.map((c) => ({ ...structuredClone(c), id: uid(), from: idMap.get(c.from), to: idMap.get(c.to) }));
  const labels = (clip.labels ?? []).map((l) => {
    const copy = { ...structuredClone(l), id: uid() };
    if (!l.attach) return { ...copy, position: [l.position[0] + dx, l.position[1], l.position[2] + dz] };
    const moved = (l.attach.type === 'zone' ? zoneMap : idMap).get(l.attach.id);
    return moved
      ? { ...copy, attach: { ...l.attach, id: moved } }
      : { ...copy, attach: { ...l.attach, offset: [l.attach.offset[0] + dx, 0, l.attach.offset[2] + dz] } };
  });
  const main = clip.type === 'zone' ? { type: 'zone', id: zones[0].id } : clip.type === 'node' ? { type: 'node', id: nodes[0].id } : clip.type === 'label' ? { type: 'label', id: labels[0].id } : null;
  const all = [...nodes.map((n) => ({ type: 'node', id: n.id })), ...zones.map((z) => ({ type: 'zone', id: z.id })), ...connectors.map((c) => ({ type: 'connector', id: c.id })), ...labels.map((l) => ({ type: 'label', id: l.id }))];
  return { nodes, zones, connectors, labels, main, all };
}

export const describe = (clip) => {
  if (clip.type === 'group') return `${clip.nodes.length + clip.zones.length + (clip.labels?.length ?? 0)} items`;
  if (clip.type === 'label') return `“${clip.main.text || 'Text'}”`;
  const name = clip.main.label || 'Untitled';
  if (clip.type === 'node') return `“${name}”`;
  const n = clip.nodes.length, c = clip.connectors.length;
  return `“${name}” with ${n} ${n === 1 ? 'item' : 'items'}${c ? ` and ${c} ${c === 1 ? 'connection' : 'connections'}` : ''}`;
};
