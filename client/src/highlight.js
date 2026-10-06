import { useMemo } from 'react';
import { useStore } from './store';

// A node belongs to a zone when its cell lies inside the zone's rectangle.
export const inZone = (z, n) =>
  Math.abs(n.position[0] - z.position[0]) <= z.size[0] / 2 && Math.abs(n.position[2] - z.position[2]) <= z.size[2] / 2;
export const zoneMembers = (z, nodes) => nodes.filter((n) => inZone(z, n));

// What to spotlight for the current selection (everything else is dimmed), or null for "no spotlight":
//  - a zone: the nodes inside it, every connection touching them, and the nodes on the far end of those
//  - a connection: just the two nodes it joins (and itself)
export function useHighlight() {
  const sel = useStore((s) => s.selection);
  const data = useStore((s) => s.data);
  return useMemo(() => {
    if (!sel) return null;
    if (sel.type === 'connector') {
      const c = data.connectors.find((x) => x.id === sel.id);
      return c ? { nodes: new Set([c.from, c.to]), connectors: new Set([c.id]) } : null;
    }
    if (sel.type === 'zone') {
      const z = data.zones.find((x) => x.id === sel.id);
      if (!z) return null;
      const inside = new Set(zoneMembers(z, data.nodes).map((n) => n.id));
      const nodes = new Set(inside), connectors = new Set();
      for (const c of data.connectors) {
        if (inside.has(c.from) || inside.has(c.to)) { connectors.add(c.id); nodes.add(c.from); nodes.add(c.to); }
      }
      return { nodes, connectors, inside };
    }
    return null;
  }, [sel, data]);
}
