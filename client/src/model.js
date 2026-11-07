import * as THREE from 'three';
import { cleanBundle } from './modelBundle.js';

// Short random id. crypto.randomUUID() only exists on HTTPS / localhost, and Strata is often served over plain http
// (a LAN address, an IP behind a proxy), where it is undefined, so fall back to getRandomValues (works everywhere).
export const uid = () => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
export const EMPTY = () => ({ nodes: [], connectors: [], zones: [], labels: [] });

export const BASIC_SHAPES = ['box', 'cylinder', 'sphere', 'slab'];
export const DEVICE_SHAPES = ['user', 'server', 'router', 'switch', 'firewall', 'accesspoint', 'antenna', 'pc', 'laptop', 'phone', 'printer', 'database', 'cache', 'cloud', 'container', 'pyramid'];
export const SHAPES = [...BASIC_SHAPES, ...DEVICE_SHAPES, 'model'];
export const SHAPE_NAMES = { accesspoint: 'access point', router: 'router / relay', pc: 'PC', antenna: 'antenna tower', container: 'container', pyramid: 'hub', model: 'your 3D model' };
export const shapeName = (s) => SHAPE_NAMES[s] ?? s;
export const LABEL_EDGES = ['back', 'front', 'left', 'right'];
export const ROUTES = ['orthogonal', 'orthogonal-z', 'straight', 'curved'];
export const ROUTE_NAMES = { orthogonal: 'right angles (X first)', 'orthogonal-z': 'right angles (Z first)', straight: 'straight', curved: 'curved' };
export const PALETTE = ['#4f8cff', '#22b8a6', '#f5a524', '#ef5b7b', '#8b6cf6', '#64748b'];
export const ICONS = ['🖥️', '🗄️', '☁️', '👤', '🔒', '📨', '🌐', '⚙️', '📦', '📊', '🔌', '📱'];

export function newNode(shape, position, index) {
  return {
    id: uid(), label: 'New node', subtitle: '', description: '', shape,
    color: PALETTE[index % PALETTE.length], position, icon: null,
  };
}

// Zones are flat floor areas: only width (size[0]) and depth (size[2]) matter; the middle entry stays 0.
export const newZone = (position) => ({
  id: uid(), label: 'New zone', color: '#4f8cff', position: [position[0] + 0.5, 0, position[2] + 0.5], size: [6, 0, 6], labelMode: 'edge', labelEdge: 'back', // edges land on cell borders
});

export const flattenLabel = (l) => ({
  ...l, position: [l.position[0], 0, l.position[2]],
  ...(l.attach ? { attach: { ...l.attach, offset: [l.attach.offset[0], 0, l.attach.offset[2]] } } : {}),
});

// Everything lives on the ground plane. Older diagrams that had heights are flattened on load.
export function flatten(data) {
  return {
    ...data,
    nodes: data.nodes.map((n) => ({ ...n, position: [n.position[0], 0, n.position[2]] })),
    zones: data.zones.map((z) => ({ ...z, position: [z.position[0], 0, z.position[2]], size: [z.size[0], 0, z.size[2]] })),
    labels: (data.labels ?? []).map((l) => flattenLabel(l)),
  };
}

export function newConnector(from, to) {
  return { id: uid(), from, to, route: 'orthogonal', line: 'solid', arrow: true, label: '', subtitle: '', description: '', arrowStart: false, flow: 'forward' };
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
  } else if (route === 'orthogonal-z') {
    pts = dedupe([A, new THREE.Vector3(A.x, A.y, B.z), new THREE.Vector3(B.x, A.y, B.z), B]);
  } else if (route === 'curved') {
    const mid = A.clone().add(B).multiplyScalar(0.5);
    mid.y += Math.max(1, A.distanceTo(B) * 0.25);
    pts = new THREE.QuadraticBezierCurve3(A, mid, B).getPoints(28);
  } else {
    pts = [A, B];
  }
  return trimEnds(pts);
}

// A route from the router (ground points) turned into the 3D points the scene draws, with both ends pulled back to the node surface.
export const routedPoints = (ground, y = 0) => trimEnds(ground.map(([x, z]) => new THREE.Vector3(x, y, z)));

// Two nodes on one spot have nothing to connect: a curved line between them would still arc up and back down onto the same point.
export const sameSpot = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.02;

// A line between two nodes on the same square has no length and no direction, so there is nothing to draw (or point an arrow along).
export const isDrawable = (points) => points.length >= 2 && points.reduce((sum, p, i) => sum + (i ? p.distanceTo(points[i - 1]) : 0), 0) > 0.02;

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
  return { name: typeof d.name === 'string' ? d.name : null, data, models: cleanBundle(d.models) };
}
