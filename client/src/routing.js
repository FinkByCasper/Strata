// Orthogonal connectors keep their familiar elbow when nothing is in the way. When a node is, the line is routed around it on the grid.
// Lines that would lie on top of each other are spread into parallel lanes.
const MARGIN = 5;
const TURN = 2;
const MAX_EXPANSIONS = 2500;
const LANE_GAP = 0.2;
const SPREAD = 0.9;
const EPS = 1e-6;

const cellOf = (p) => [Math.round(p[0]), Math.round(p[2])];
const cellKey = (x, z) => (x + 50000) * 100000 + (z + 50000);
const cellOfKey = (k) => [Math.floor(k / 100000) - 50000, (k % 100000) - 50000];

function legCells(from, to) {
  const out = [];
  const stepX = Math.sign(to[0] - from[0]), stepZ = Math.sign(to[1] - from[1]);
  let x = from[0], z = from[1];
  while (x !== to[0] || z !== to[1]) {
    if (x !== to[0]) x += stepX; else z += stepZ;
    out.push([x, z]);
  }
  return out;
}

function elbow(start, goal, firstAxis) {
  const corner = firstAxis === 0 ? [goal[0], start[1]] : [start[0], goal[1]];
  return [start, corner, goal];
}

function clear(path, blocked, start, goal) {
  for (let i = 0; i < path.length - 1; i++) {
    for (const [x, z] of legCells(path[i], path[i + 1])) {
      if ((x === start[0] && z === start[1]) || (x === goal[0] && z === goal[1])) continue;
      if (blocked.has(cellKey(x, z))) return false;
    }
  }
  return true;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const axisOf = (d) => (d < 2 ? 0 : 1);

// Cheapest right-angled path on whole grid squares that keeps off every blocked square: fewest squares, then fewest bends.
export function around(start, goal, blocked, firstAxis, margin = MARGIN) {
  const minX = Math.min(start[0], goal[0]) - margin, maxX = Math.max(start[0], goal[0]) + margin;
  const minZ = Math.min(start[1], goal[1]) - margin, maxZ = Math.max(start[1], goal[1]) + margin;
  const h = (x, z) => Math.abs(x - goal[0]) + Math.abs(z - goal[1]);
  const id = (x, z, d) => (cellKey(x, z) * 4) + d;
  const best = new Map(), parent = new Map();
  const heap = new Heap();
  for (let d = 0; d < 4; d++) {
    const g = axisOf(d) === firstAxis ? 0 : 0.5;
    best.set(id(start[0], start[1], d), g);
    heap.push([g + h(start[0], start[1]), g, start[0], start[1], d]);
  }
  let expanded = 0;
  while (heap.size) {
    const [, g, x, z, d] = heap.pop();
    if (g > (best.get(id(x, z, d)) ?? Infinity)) continue;
    if (x === goal[0] && z === goal[1]) {
      const cells = [[x, z]];
      let at = id(x, z, d);
      while (parent.has(at)) {
        at = parent.get(at);
        const d2 = at % 4, c = (at - d2) / 4;
        cells.push([Math.floor(c / 100000) - 50000, (c % 100000) - 50000]);
      }
      return cells.reverse();
    }
    if (++expanded > MAX_EXPANSIONS) return null;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d ^ 1)) continue;
      const nx = x + DIRS[nd][0], nz = z + DIRS[nd][1];
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      if (blocked.has(cellKey(nx, nz)) && !(nx === goal[0] && nz === goal[1])) continue;
      const ng = g + 1 + (nd === d ? 0 : TURN);
      const nid = id(nx, nz, nd);
      if (ng >= (best.get(nid) ?? Infinity)) continue;
      best.set(nid, ng);
      parent.set(nid, id(x, z, d));
      heap.push([ng + h(nx, nz), ng, nx, nz, nd]);
    }
  }
  return null;
}

function turns(cells) {
  const out = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1], b = cells[i], c = cells[i + 1];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

// The route of one orthogonal connector as ground points from the first node's position to the second's.
export function orthogonalRoute(a, b, firstAxis, blocked) {
  const A = [a[0], a[2]], B = [b[0], b[2]];
  const start = cellOf(a), goal = cellOf(b);
  const direct = dedupePoints(elbow(A, B, firstAxis));
  if (clear(elbow(start, goal, firstAxis), blocked, start, goal)) return direct;
  const cells = around(start, goal, blocked, firstAxis);
  if (!cells || cells.length < 2) return direct;
  const corners = turns(cells);
  const path = corners.map((p) => [p[0], p[1]]);
  // Nodes that are off the whole-number grid (snapping switched off): carry their exact position along the first leg so the line stays right-angled.
  path[0] = A;
  for (let i = 0; i < path.length - 1; i++) {
    if (corners[i][1] === corners[i + 1][1]) path[i + 1][1] = path[i][1]; else path[i + 1][0] = path[i][0];
  }
  path[path.length - 1] = B;
  return dedupePoints(path);
}

const dedupePoints = (pts) => pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) > EPS || Math.abs(p[1] - pts[i - 1][1]) > EPS);

const round3 = (v) => Math.round(v * 1000);

// Spread routes that share a stretch of line into side-by-side lanes. Works on the stretches (runs) between bends, and recomputes the
// bends from the moved runs, so every line stays right-angled.
export function spread(polylines) {
  const runs = [];
  polylines.forEach((pts, r) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      if (Math.abs(dz) < EPS && Math.abs(dx) > EPS) runs.push({ r, i, axis: 0, c: pts[i][1], lo: Math.min(pts[i][0], pts[i + 1][0]), hi: Math.max(pts[i][0], pts[i + 1][0]), lane: 0, comp: runs.length });
      else if (Math.abs(dx) < EPS && Math.abs(dz) > EPS) runs.push({ r, i, axis: 1, c: pts[i][0], lo: Math.min(pts[i][1], pts[i + 1][1]), hi: Math.max(pts[i][1], pts[i + 1][1]), lane: 0, comp: runs.length });
    }
  });
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.axis}:${round3(run.c)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(run);
  }
  const offset = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((p, q) => p.lo - q.lo || p.r - q.r || p.i - q.i);
    const parentOf = new Map(group.map((g) => [g, g]));
    const find = (g) => { while (parentOf.get(g) !== g) g = parentOf.get(g); return g; };
    group.forEach((run, k) => {
      const taken = new Set();
      for (let j = 0; j < k; j++) {
        const other = group[j];
        if (other.hi > run.lo + EPS) { taken.add(other.lane); parentOf.set(find(other), find(run)); }
      }
      while (taken.has(run.lane)) run.lane++;
    });
    const width = new Map();
    for (const run of group) { const root = find(run); width.set(root, Math.max(width.get(root) ?? 0, run.lane + 1)); }
    for (const run of group) {
      const n = width.get(find(run));
      if (n > 1) offset.set(`${run.r}:${run.i}`, (run.lane - (n - 1) / 2) * Math.min(LANE_GAP, SPREAD / n));
    }
  }
  if (!offset.size) return polylines;

  return polylines.map((pts, r) => {
    const line = (i) => {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const o = offset.get(`${r}:${i}`) ?? 0;
      if (Math.abs(dz) < EPS && Math.abs(dx) > EPS) return { axis: 0, c: pts[i][1] + o };
      if (Math.abs(dx) < EPS && Math.abs(dz) > EPS) return { axis: 1, c: pts[i][0] + o };
      return null;
    };
    const out = pts.map((p) => [...p]);
    const first = line(0);
    if (first) first.axis === 0 ? (out[0][1] = first.c) : (out[0][0] = first.c);
    for (let k = 1; k < pts.length - 1; k++) {
      const before = line(k - 1), after = line(k);
      if (!before || !after || before.axis === after.axis) continue;
      out[k] = before.axis === 0 ? [after.c, before.c] : [before.c, after.c];
    }
    const last = line(pts.length - 2);
    if (last) last.axis === 0 ? (out[pts.length - 1][1] = last.c) : (out[pts.length - 1][0] = last.c);
    return out;
  });
}

// Straight and curved connectors between the same two nodes would be drawn on top of each other: move them sideways, side by side.
function sideBySide(connectors, byId) {
  const groups = new Map();
  for (const c of connectors) {
    if (c.route === 'orthogonal' || c.route === 'orthogonal-z') continue;
    const [lo, hi] = c.from < c.to ? [c.from, c.to] : [c.to, c.from];
    const key = `${lo}|${hi}|${c.route}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(c);
  }
  const out = new Map();
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const [lo, hi] = key.split('|');
    const a = byId.get(lo), b = byId.get(hi);
    if (!a || !b) continue;
    const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2];
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len, pz = dx / len;
    const gap = Math.min(LANE_GAP, SPREAD / list.length);
    list.forEach((c, i) => out.set(c.id, [px * (i - (list.length - 1) / 2) * gap, pz * (i - (list.length - 1) / 2) * gap]));
  }
  return out;
}

// Routing is the expensive part and most edits (a label, a colour, dragging one node) leave most routes alone, so a route is kept
// until an end moves or a square inside the area it searched changes.
let memo = { blocked: new Set(), routes: new Map(), changed: [] };
export const forgetRoutes = () => { memo = { blocked: new Set(), routes: new Map(), changed: [] }; };

function remembered(c, a, b, blocked) {
  const firstAxis = c.route === 'orthogonal' ? 0 : 1;
  const start = cellOf(a), goal = cellOf(b);
  const box = [Math.min(start[0], goal[0]) - MARGIN, Math.max(start[0], goal[0]) + MARGIN, Math.min(start[1], goal[1]) - MARGIN, Math.max(start[1], goal[1]) + MARGIN];
  const same = `${a[0]},${a[2]},${b[0]},${b[2]},${firstAxis}`;
  const hit = memo.routes.get(c.id);
  if (hit && hit.same === same && !memo.changed.some(([x, z]) => x >= box[0] && x <= box[1] && z >= box[2] && z <= box[3])) { hit.used = true; return hit.poly; }
  const poly = orthogonalRoute(a, b, firstAxis, blocked);
  memo.routes.set(c.id, { same, poly, used: true });
  return poly;
}

// For every connector: either the right-angled ground points to draw (`poly`), or how far to move the two ends sideways (`shift`) for lines that are straight or curved.
export function routeAll(nodes, connectors) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blocked = new Set(nodes.map((n) => cellKey(...cellOf(n.position))));
  memo.changed = [...blocked].filter((k) => !memo.blocked.has(k)).concat([...memo.blocked].filter((k) => !blocked.has(k))).map(cellOfKey);
  const ortho = connectors.filter((c) => (c.route === 'orthogonal' || c.route === 'orthogonal-z') && byId.has(c.from) && byId.has(c.to));
  const lines = spread(ortho.map((c) => remembered(c, byId.get(c.from).position, byId.get(c.to).position, blocked)));
  const out = new Map();
  ortho.forEach((c, i) => out.set(c.id, { poly: lines[i] }));
  memo.blocked = blocked;
  for (const [id, entry] of memo.routes) { if (entry.used) entry.used = false; else memo.routes.delete(id); }
  for (const [id, shift] of sideBySide(connectors, byId)) out.set(id, { shift });
  return out;
}
