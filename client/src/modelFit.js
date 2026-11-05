// Nodes sit on a floor at y = -0.5 and cells are one unit wide. An unscaled model is shrunk or grown so its longest side is one cell,
// because models arrive in whatever unit the artist used (millimetres, metres, ...).
export const FLOOR = -0.5;
export const FIT = 1;
export const SCALE_MIN = 0.01;
export const SCALE_MAX = 100;

export const clampScale = (v) => (Number.isFinite(v) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) : 1);
export const rotationDegrees = (node) => (Array.isArray(node.modelRotation) && node.modelRotation.length === 3 ? node.modelRotation.map((d) => (Number.isFinite(d) ? d : 0)) : [0, 0, 0]);

// min/max: the model's bounding box after the node's rotation, in the model's own units. Returns null for an empty or degenerate model.
export function fit(min, max, scale = 1) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const longest = Math.max(...size);
  if (!(longest > 0) || !Number.isFinite(longest)) return null;
  const k = (FIT / longest) * clampScale(scale);
  return {
    k,
    offset: [-((min[0] + max[0]) / 2) * k, FLOOR - min[1] * k, -((min[2] + max[2]) / 2) * k],
    size: size.map((s) => s * k),
  };
}

export const labelHeight = (fitted) => Math.max(0.35, FLOOR + fitted.size[1] + 0.25);
