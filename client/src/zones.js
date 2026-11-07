import { freeLabelsIn } from './textLabels.js';

// A node belongs to a zone when its cell lies inside the zone's rectangle.
export const inZone = (z, n) =>
  Math.abs(n.position[0] - z.position[0]) <= z.size[0] / 2 && Math.abs(n.position[2] - z.position[2]) <= z.size[2] / 2;
export const zoneMembers = (z, nodes) => nodes.filter((n) => inZone(z, n));

export const zoneHolds = (z, o) =>
  o.id !== z.id
  && Math.abs(o.position[0] - z.position[0]) + o.size[0] / 2 <= z.size[0] / 2
  && Math.abs(o.position[2] - z.position[2]) + o.size[2] / 2 <= z.size[2] / 2;

// Everything that belongs to a zone: the nodes inside it, any other zone lying wholly within it, and the free text laid on it.
export function zoneContents(z, data) {
  const nodes = new Set(zoneMembers(z, data.nodes).map((n) => n.id));
  const zones = new Set(data.zones.filter((o) => zoneHolds(z, o)).map((o) => o.id));
  const labels = new Set(freeLabelsIn(z, data.labels ?? []).map((l) => l.id));
  return { nodes, zones, labels };
}
