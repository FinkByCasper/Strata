import { useMemo } from 'react';
import { useStore } from './store';

import { zoneMembers } from './zones.js';

export { inZone, zoneContents, zoneMembers } from './zones.js';

// What to spotlight for the current selection (everything else is dimmed), or null for "no spotlight":
//  - a zone: the nodes inside it, every connection touching them, and the nodes on the far end of those
//  - a connection: just the two nodes it joins (and itself)
//  - a node, in the read-only view: the node, every connection it has, and the nodes on their far ends
export function useHighlight() {
  const sel = useStore((s) => s.selection);
  const grouped = useStore((s) => s.multi.length > 1);
  const data = useStore((s) => s.data);
  const readOnly = useStore((s) => s.readOnly);
  return useMemo(() => {
    if (!sel || grouped) return null;
    if (sel.type === 'node') {
      if (!readOnly) return null;   // while editing, a selected node is not spotlighted (it would get in the way)
      const mine = data.connectors.filter((c) => c.from === sel.id || c.to === sel.id);
      return { nodes: new Set([sel.id, ...mine.flatMap((c) => [c.from, c.to])]), connectors: new Set(mine.map((c) => c.id)) };
    }
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
  }, [sel, grouped, data, readOnly]);
}
