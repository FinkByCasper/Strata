import * as THREE from 'three';

export const uid = () => crypto.randomUUID().slice(0, 8);
export const EMPTY = () => ({ nodes: [], connectors: [], zones: [] });

export const BASIC_SHAPES = ['box', 'cylinder', 'sphere', 'slab'];
export const DEVICE_SHAPES = ['user', 'server', 'router', 'accesspoint', 'pc', 'laptop', 'phone', 'database', 'cache'];
export const SHAPES = [...BASIC_SHAPES, ...DEVICE_SHAPES];
export const SHAPE_NAMES = { accesspoint: 'access point', router: 'router / relay', pc: 'PC' };
export const shapeName = (s) => SHAPE_NAMES[s] ?? s;
export const ROUTES = ['orthogonal', 'straight', 'curved'];
export const PALETTE = ['#4f8cff', '#22b8a6', '#f5a524', '#ef5b7b', '#8b6cf6', '#64748b'];
export const ICONS = ['🖥️', '🗄️', '☁️', '👤', '🔒', '📨', '🌐', '⚙️', '📦', '📊', '🔌', '📱'];

export function newNode(shape, position, index) {
  return {
    id: uid(), label: 'New node', description: '', shape,
    color: PALETTE[index % PALETTE.length], position, icon: null,
  };
}

// Zones are flat floor areas: only width (size[0]) and depth (size[2]) matter; the middle entry stays 0.
export const newZone = (position) => ({
  id: uid(), label: 'New zone', color: '#4f8cff', position: [position[0] + 0.5, 0, position[2] + 0.5], size: [6, 0, 6], // edges land on cell borders
});

// Everything lives on the ground plane. Older diagrams that had heights are flattened on load.
export function flatten(data) {
  return {
    ...data,
    nodes: data.nodes.map((n) => ({ ...n, position: [n.position[0], 0, n.position[2]] })),
    zones: data.zones.map((z) => ({ ...z, position: [z.position[0], 0, z.position[2]], size: [z.size[0], 0, z.size[2]] })),
  };
}

export function newConnector(from, to) {
  return { id: uid(), from, to, route: 'orthogonal', line: 'solid', arrow: true, label: '' };
}

// Nearest free integer grid cell on the ground plane, spiralling out from the origin.
export function freeSpot(nodes) {
  const taken = new Set(nodes.map((n) => `${n.position[0]},${n.position[2]}`));
  for (let r = 0; r < 50; r++) {
    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
        if (!taken.has(`${x * 3},${z * 3}`)) return [x * 3, 0, z * 3];
      }
    }
  }
  return [0, 0, 0];
}

const V = (p) => new THREE.Vector3(...p);

function dedupe(points) {
  return points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-6);
}

// Pull each end back toward the middle so lines stop at the node surface instead of its centre.
function trimEnds(points, amount = 0.6) {
  if (points.length < 2) return points;
  const out = points.map((p) => p.clone());
  const pull = (i, j) => {
    const d = out[j].clone().sub(out[i]);
    const len = d.length();
    out[i].add(d.multiplyScalar(Math.min(amount, len * 0.4) / (len || 1)));
  };
  pull(0, 1);
  pull(out.length - 1, out.length - 2);
  return out;
}

// Connector geometry is derived from node positions, so connectors follow nodes automatically.
export function routePoints(a, b, route) {
  const A = V(a), B = V(b);
  let pts;
  if (route === 'orthogonal') {
    pts = dedupe([A, new THREE.Vector3(B.x, A.y, A.z), new THREE.Vector3(B.x, A.y, B.z), B]);
  } else if (route === 'curved') {
    const mid = A.clone().add(B).multiplyScalar(0.5);
    mid.y += Math.max(1, A.distanceTo(B) * 0.25);
    pts = new THREE.QuadraticBezierCurve3(A, mid, B).getPoints(28);
  } else {
    pts = [A, B];
  }
  return trimEnds(pts);
}

export function polylineMidpoint(points) {
  const total = points.reduce((s, p, i) => s + (i ? p.distanceTo(points[i - 1]) : 0), 0);
  let walk = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = points[i].distanceTo(points[i - 1]);
    if (walk <= seg) return points[i - 1].clone().lerp(points[i], seg ? walk / seg : 0);
    walk -= seg;
  }
  return points[points.length - 1].clone();
}

// Accepts untrusted JSON (import) and returns a clean diagram or throws.
export function parseDiagram(raw) {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const data = d?.data ?? d;
  if (!data || ![data.nodes, data.connectors, data.zones].every(Array.isArray)) {
    throw new Error('Not a Strata diagram file');
  }
  return { name: typeof d.name === 'string' ? d.name : null, data };
}
