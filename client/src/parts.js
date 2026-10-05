import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Every node model is baked ONCE into a few merged geometries, one per material "role"
// (main body, dark trim, LEDs, screens...). All nodes of a kind then share those geometries and are
// drawn with a single instanced draw call per role, so the cost no longer grows with the node count.
const V = (a) => new THREE.Vector3(...a);
const mat4 = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) =>
  new THREE.Matrix4().compose(V(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(s));

function bake(build) {
  const byRole = {};
  const add = (role, geo, p, r, parent) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = mat4(p, r);
    g.applyMatrix4(parent ? parent.clone().multiply(m) : m);
    (byRole[role] ??= []).push(g);
  };
  const B = (role, size, p, r, parent) => add(role, new THREE.BoxGeometry(...size), p, r, parent);
  const C = (role, a, p, r, parent) => add(role, new THREE.CylinderGeometry(...a), p, r, parent);
  const S = (role, a, p, r, parent) => add(role, new THREE.SphereGeometry(...a), p, r, parent);
  const T = (role, a, p, r, parent) => add(role, new THREE.TorusGeometry(...a), p, r, parent);
  const K = (role, a, p, r, parent) => add(role, new THREE.ConeGeometry(...a), p, r, parent);
  const P = (role, a, p, r, parent) => add(role, new THREE.CapsuleGeometry(...a), p, r, parent);
  build({ B, C, S, T, K, P, mat4 });
  return Object.entries(byRole).map(([role, gs]) => ({ role, geometry: mergeGeometries(gs) }));
}

const PI = Math.PI;
const BUILDERS = {
  // ---- basic shapes (one cell wide) ----
  box: ({ B }) => B('main', [1, 1, 1]),
  cylinder: ({ C }) => C('main', [0.5, 0.5, 1, 32]),
  sphere: ({ S }) => S('main', [0.5, 24, 16]),
  slab: ({ B }) => B('main', [3, 0.25, 3], [0, -0.375, 0]),   // a 3x3-cell platform, edges stay on cell borders

  // ---- device models ----
  user: ({ P, S }) => { P('main', [0.27, 0.16, 4, 14], [0, -0.15, 0]); S('skin', [0.22, 18, 12], [0, 0.4, 0]); },
  server: ({ B }) => {
    for (const y of [-0.36, -0.04, 0.28]) {
      B('main', [0.92, 0.27, 0.72], [0, y, 0]); B('dark', [0.8, 0.15, 0.01], [0, y, 0.362]);
      B('led', [0.05, 0.05, 0.012], [-0.3, y, 0.37]);
      B('light', [0.3, 0.025, 0.012], [0.2, y + 0.03, 0.37]); B('light', [0.3, 0.025, 0.012], [0.2, y - 0.03, 0.37]);
    }
  },
  router: ({ B, C, S, mat4 }) => {
    B('main', [1, 0.2, 0.68], [0, -0.4, 0]); B('dark', [0.86, 0.08, 0.01], [0, -0.41, 0.342]);
    for (const x of [-0.3, -0.15, 0, 0.15]) B('led', [0.06, 0.02, 0.06], [x, -0.29, 0.22]);
    for (const x of [-0.36, 0.36]) {
      const a = mat4([x, -0.3, -0.22], [0, 0, -x * 0.5]);
      C('dark', [0.035, 0.035, 0.6, 8], [0, 0.3, 0], undefined, a); S('dark', [0.05, 6, 4], [0, 0.6, 0], undefined, a);
    }
  },
  accesspoint: ({ C, S, T }) => {
    C('light', [0.46, 0.46, 0.1, 28], [0, -0.45, 0]);
    S('main', [0.3, 24, 10, 0, PI * 2, 0, PI / 2], [0, -0.4, 0]); S('led', [0.03, 6, 4], [0, -0.18, 0.2]);
    for (const [y, r] of [[0.1, 0.34], [0.34, 0.2]]) T('ring', [r, 0.02, 6, 28], [0, y, 0], [PI / 2, 0, 0]);
  },
  pc: ({ B, C, S, mat4 }) => {
    const g = mat4([0, 0, 0], [0, 0, 0], [0.95, 0.95, 0.95]);
    B('main', [0.4, 0.92, 0.7], [-0.32, -0.04, 0], undefined, g);
    B('dark', [0.3, 0.06, 0.01], [-0.32, 0.25, 0.352], undefined, g); B('dark', [0.3, 0.06, 0.01], [-0.32, 0.15, 0.352], undefined, g);
    S('led', [0.035, 6, 4], [-0.32, -0.3, 0.355], undefined, g);
    B('dark', [0.34, 0.04, 0.3], [0.24, -0.48, 0], undefined, g); C('dark', [0.04, 0.04, 0.26, 8], [0.24, -0.34, 0], undefined, g);
    B('dark', [0.66, 0.46, 0.06], [0.24, 0, 0], undefined, g); B('blue', [0.58, 0.38, 0.01], [0.24, 0, 0.032], undefined, g);
  },
  laptop: ({ B, mat4 }) => {
    B('main', [1, 0.06, 0.7], [0, -0.47, 0.02]); B('dark', [0.84, 0.01, 0.38], [0, -0.437, -0.02]); B('light', [0.3, 0.01, 0.14], [0, -0.437, 0.22]);
    const h = mat4([0, -0.44, -0.33], [-0.32, 0, 0]);
    B('main', [1, 0.66, 0.04], [0, 0.33, 0], undefined, h); B('screen', [0.9, 0.56, 0.01], [0, 0.33, 0.022], undefined, h); B('blue', [0.8, 0.46, 0.005], [0, 0.33, 0.03], undefined, h);
  },
  phone: ({ B, S }) => {
    B('main', [0.44, 0.84, 0.08], [0, -0.08, 0]); B('screen', [0.38, 0.72, 0.01], [0, -0.06, 0.042]);
    B('blue', [0.32, 0.6, 0.005], [0, -0.06, 0.05]); S('black', [0.018, 6, 4], [0, 0.27, 0.046]);
  },
  database: ({ C, S }) => {
    for (const y of [-0.365, -0.065, 0.235]) {
      C('main', [0.42, 0.42, 0.27, 28], [0, y, 0]); C('light', [0.425, 0.425, 0.04, 28], [0, y + 0.02, 0]); S('led', [0.03, 6, 4], [0.28, y - 0.06, 0.3]);
    }
  },
  cache: ({ B }) => {
    B('main', [0.86, 0.12, 0.86], [0, -0.44, 0]); B('dark', [0.52, 0.1, 0.52], [0, -0.33, 0]); B('gold', [0.2, 0.012, 0.2], [0.1, -0.277, 0.1]);
    for (const p of [-0.3, -0.15, 0, 0.15, 0.3]) {
      B('gold', [0.07, 0.04, 0.14], [p, -0.44, 0.5]); B('gold', [0.07, 0.04, 0.14], [p, -0.44, -0.5]);
      B('gold', [0.14, 0.04, 0.07], [0.5, -0.44, p]); B('gold', [0.14, 0.04, 0.07], [-0.5, -0.44, p]);
    }
  },
  switch: ({ B }) => {
    B('main', [1.1, 0.2, 0.72], [0, -0.4, 0]); B('dark', [0.96, 0.09, 0.01], [0, -0.4, 0.362]);
    for (let i = 0; i < 8; i++) B(i % 3 === 0 ? 'led' : 'light', [0.07, 0.05, 0.012], [-0.4 + i * 0.115, -0.4, 0.37]);
    B('light', [0.3, 0.02, 0.2], [0.3, -0.295, 0]);
  },
  firewall: ({ B, T }) => {
    for (let r = 0; r < 5; r++) {
      const y = -0.42 + r * 0.19;
      for (const x of r % 2 === 0 ? [-0.33, 0, 0.33] : [-0.495, -0.165, 0.165, 0.495]) {
        B('main', [r % 2 === 0 || Math.abs(x) < 0.4 ? 0.31 : 0.15, 0.17, 0.3], [x, y, 0]);
      }
    }
    B('gold', [0.22, 0.17, 0.07], [0.3, -0.3, 0.19]); T('gold', [0.07, 0.022, 6, 12, PI], [0.3, -0.2, 0.19]);
  },
  cloud: ({ S, mat4 }) => {
    S('main', [0.36, 16, 10], [0, 0, 0], undefined, mat4([0, -0.3, 0], [0, 0, 0], [1.5, 0.5, 1]));
    S('main', [0.28, 16, 10], [-0.28, -0.13, 0]); S('main', [0.37, 16, 10], [0.04, 0.02, 0.02]); S('main', [0.26, 16, 10], [0.32, -0.15, 0]);
  },
  antenna: ({ B, C, S }) => {
    C('dark', [0.42, 0.46, 0.06, 24], [0, -0.47, 0]);
    C('lattice', [0.02, 0.3, 1.3, 4, 9, true], [0, 0.2, 0], [0, PI / 4, 0]);
    C('main', [0.025, 0.04, 1.3, 8], [0, 0.2, 0]);
    B('dark', [0.34, 0.025, 0.025], [0, 0.5, 0]); B('dark', [0.22, 0.025, 0.025], [0, 0.2, 0]);
    S('red', [0.05, 8, 6], [0, 0.88, 0]);
    C('cast', [0.03, 0.2, 1.3, 4], [0, 0.2, 0], [0, PI / 4, 0]);   // invisible solid mast: the lattice is see-through, so this casts its shadow
  },
  printer: ({ B }) => {
    B('main', [0.95, 0.3, 0.62], [0, -0.35, 0.04]); B('light', [0.95, 0.08, 0.58], [0, -0.16, 0.04]);
    B('paper', [0.5, 0.02, 0.4], [0, 0, -0.22], [-0.55, 0, 0]); B('dark', [0.7, 0.04, 0.3], [0, -0.45, 0.4]); B('led', [0.2, 0.05, 0.01], [0.3, -0.3, 0.353]);
  },
  pyramid: ({ K }) => K('main', [0.66, 0.84, 4], [0, -0.08, 0], [0, PI / 4, 0]),
  container: ({ B }) => {
    B('glass', [0.95, 0.95, 0.95]);
    for (const a of [-0.475, 0.475]) for (const b of [-0.475, 0.475]) {   // the glass cube's 12 edges
      B('dark', [0.95, 0.02, 0.02], [0, a, b]); B('dark', [0.02, 0.95, 0.02], [a, 0, b]); B('dark', [0.02, 0.02, 0.95], [a, b, 0]);
    }
    for (const y of [-0.2, 0.06]) B('main', [0.62, 0.18, 0.62], [0, y, 0]);
    B('light', [0.62, 0.05, 0.62], [0, -0.4, 0]); B('light', [0.5, 0.05, 0.5], [0, 0.27, 0]);
  },
};

export const BASIC_KINDS = ['box', 'cylinder', 'sphere', 'slab'];
export const isDevice = (kind) => kind in BUILDERS && !BASIC_KINDS.includes(kind);
// Height of the DOM label above a node, per kind.
export const LABEL_Y = { switch: 0.5, firewall: 0.75, cloud: 0.7, antenna: 1.3, printer: 0.55, pyramid: 0.6, container: 0.95, user: 0.95, server: 0.85, router: 0.95, accesspoint: 0.8, pc: 0.8, laptop: 0.7, phone: 0.65, database: 0.75, cache: 0.35, slab: 0.55 };
export const labelY = (kind) => LABEL_Y[kind] ?? 1.05;

const cache = new Map();
export function partsFor(kind) {
  let p = cache.get(kind);
  if (!p) { p = bake(BUILDERS[kind] ?? BUILDERS.box); cache.set(kind, p); }
  return p;
}

// ---- materials ----
// "Tinted" roles take the node's colour. In instanced draws that comes from the per-instance colour, so the
// material itself is white; non-instanced (focused) nodes use a coloured, optionally glowing material.
export const TINT_ROLES = new Set(['main', 'ring', 'glass', 'lattice']);
export const NO_SHADOW = new Set(['ring', 'glass', 'lattice']);
const FIXED = {
  dark: { color: '#1f2937', roughness: 0.45, metalness: 0.15 },
  light: { color: '#e5e7eb', roughness: 0.45, metalness: 0.15 },
  screen: { color: '#0f172a', roughness: 0.45, metalness: 0.15 },
  blue: { color: '#60a5fa', roughness: 0.45, metalness: 0.15, emissive: '#60a5fa', emissiveIntensity: 0.6 },
  led: { color: '#22c55e', roughness: 0.45, metalness: 0.15, emissive: '#22c55e', emissiveIntensity: 0.6 },
  red: { color: '#ef4444', roughness: 0.45, metalness: 0.15, emissive: '#ef4444', emissiveIntensity: 0.6 },
  gold: { color: '#d4a72c', roughness: 0.45, metalness: 0.6 },
  skin: { color: '#f4d6b8', roughness: 0.7, metalness: 0 },
  paper: { color: '#f8fafc', roughness: 0.9, metalness: 0 },
  black: { color: '#000000', roughness: 0.45, metalness: 0.15 },
};
const tintProps = (role) => ({
  main: { roughness: 0.5, metalness: 0.08 },
  ring: { roughness: 0.4, transparent: true, opacity: 0.65 },
  glass: { roughness: 0.15, transparent: true, opacity: 0.2, depthWrite: false },
  lattice: { roughness: 0.5, wireframe: true },
}[role]);

const mats = new Map();
// colour = null -> shared "white" material for instancing; otherwise a coloured material (glow adds emissive).
export function materialFor(role, color = null, glow = false) {
  const key = `${role}|${color}|${glow}`;
  let m = mats.get(key);
  if (m) return m;
  if (role === 'cast') m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  else if (TINT_ROLES.has(role)) {
    m = new THREE.MeshStandardMaterial({ color: color ?? '#ffffff', ...tintProps(role) });
    if (glow && role === 'main') { m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.3; }
  } else m = new THREE.MeshStandardMaterial(FIXED[role] ?? FIXED.dark);
  mats.set(key, m);
  return m;
}
