import { inZone } from './highlight';
import { uid } from './model';

// What gets copied:
//  - a node: just the node
//  - a zone: the zone, every node inside it, every connector between those nodes, and any zone that lies wholly
//    inside it, all keeping their distances to each other (everything is stored with its original position).
// `anchor` is the point that follows the mouse: the node's square, or the zone's centre.
export function buildClip(data, sel) {
  if (sel?.type === 'node') {
    const n = data.nodes.find((x) => x.id === sel.id);
    return n && { type: 'node', anchor: [n.position[0], n.position[2]], main: n, nodes: [structuredClone(n)], zones: [], connectors: [], pasted: 0 };
  }
  if (sel?.type === 'zone') {
    const z = data.zones.find((x) => x.id === sel.id);
    if (!z) return null;
    const inside = data.nodes.filter((n) => inZone(z, n));
    const ids = new Set(inside.map((n) => n.id));
    const within = (o) => Math.abs(o.position[0] - z.position[0]) + o.size[0] / 2 <= z.size[0] / 2 && Math.abs(o.position[2] - z.position[2]) + o.size[2] / 2 <= z.size[2] / 2;
    const nested = data.zones.filter((o) => o.id !== z.id && within(o));
    return {
      type: 'zone', anchor: [z.position[0], z.position[2]], main: z,
      nodes: structuredClone(inside), zones: [structuredClone(z), ...structuredClone(nested)],
      connectors: structuredClone(data.connectors.filter((c) => ids.has(c.from) && ids.has(c.to))), pasted: 0,
    };
  }
  return null;
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

// Fresh copies (new ids, connectors re-pointed at the new nodes) shifted by (dx, dz).
export function materialize(clip, dx, dz) {
  const idMap = new Map();
  const nodes = clip.nodes.map((n) => { const id = uid(); idMap.set(n.id, id); return { ...structuredClone(n), id, position: [n.position[0] + dx, n.position[1], n.position[2] + dz] }; });
  const zones = clip.zones.map((z) => ({ ...structuredClone(z), id: uid(), position: [z.position[0] + dx, z.position[1], z.position[2] + dz] }));
  const connectors = clip.connectors.map((c) => ({ ...structuredClone(c), id: uid(), from: idMap.get(c.from), to: idMap.get(c.to) }));
  const main = clip.type === 'zone' ? { type: 'zone', id: zones[0].id } : { type: 'node', id: nodes[0].id };
  return { nodes, zones, connectors, main };
}

export const describe = (clip) => {
  const name = clip.main.label || 'Untitled';
  if (clip.type === 'node') return `“${name}”`;
  const n = clip.nodes.length, c = clip.connectors.length;
  return `“${name}” with ${n} ${n === 1 ? 'item' : 'items'}${c ? ` and ${c} ${c === 1 ? 'connection' : 'connections'}` : ''}`;
};
