// Two nodes on one grid square would draw their connections as a line of no length, so a drop onto an occupied square is settled here.
const key = (p) => `${Math.round(p[0])},${Math.round(p[2])}`;

export const occupant = (nodes, position, except = new Set()) => nodes.find((n) => !except.has(n.id) && key(n.position) === key(position)) ?? null;

// The node that was dropped onto another trades places with it: the one underneath goes to where the dropped node was picked up.
export function swapPlan(nodes, id, origin) {
  const me = nodes.find((n) => n.id === id);
  if (!me) return null;
  const other = occupant(nodes, me.position, new Set([id]));
  return other ? { id: other.id, position: [origin[0], other.position[1], origin[1]] } : null;
}

// Would moving these nodes leave any of them on a square that a node staying put holds?
export function clash(nodes, movedIds) {
  const still = new Set(nodes.filter((n) => !movedIds.has(n.id)).map((n) => key(n.position)));
  return nodes.some((n) => movedIds.has(n.id) && still.has(key(n.position)));
}

// The closest free square to a wanted one, searching outwards.
export function nearestFree(nodes, [x, z]) {
  const taken = new Set(nodes.map((n) => key(n.position)));
  const cx = Math.round(x), cz = Math.round(z);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!taken.has(`${cx + dx},${cz + dz}`)) return [cx + dx, cz + dz];
      }
    }
  }
  return [cx, cz];
}
