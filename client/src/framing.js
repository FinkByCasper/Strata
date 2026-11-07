// How big a diagram looks from the fixed 30° camera, in world units across the screen. Used to fit the view and to tell an embed
// what shape it wants to be.
const ELEVATION = Math.PI / 6;
const MIN_SIZE = 6;
const MARGIN = 3;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Measured on the real content (node boxes and zone corners), not the plan's bounding rectangle, so L-shaped layouts leave no empty margins.
export function measure(nodes, zones, azimuth) {
  const toCamera = [Math.sin(azimuth) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(azimuth) * Math.cos(ELEVATION)];
  const forward = toCamera.map((v) => -v);
  const right = unit(cross(forward, [0, 1, 0]));
  const up = unit(cross(right, forward));
  const points = [];
  for (const n of nodes) for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const y of [-0.5, 1.8]) points.push([n.position[0] + dx, y, n.position[2] + dz]);
  for (const z of zones) for (const dx of [-1, 1]) for (const dz of [-1, 1]) points.push([z.position[0] + (dx * z.size[0]) / 2, -0.5, z.position[2] + (dz * z.size[2]) / 2]);
  if (!points.length) return { width: 14, height: 14, right, up, centre: [0, 0] };
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of points) {
    const x = dot(p, right), y = dot(p, up);
    lo[0] = Math.min(lo[0], x); hi[0] = Math.max(hi[0], x);
    lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y);
  }
  return {
    width: Math.max(hi[0] - lo[0], MIN_SIZE) + MARGIN,
    height: Math.max(hi[1] - lo[1], MIN_SIZE) + MARGIN,
    right, up,
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2],
  };
}

// Width divided by height of the fitted diagram, kept within what a page can reasonably hold.
export function aspectOf(nodes, zones, azimuth) {
  const { width, height } = measure(nodes, zones, azimuth);
  return Math.min(3, Math.max(0.75, width / height));
}
