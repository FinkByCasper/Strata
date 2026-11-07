// How a connector's arrowheads, line and flow dots look. Every property can be set on the connector or as the diagram's default; the
// connector wins, then the default, then the built-in value.
export const LOOK_KEYS = ['arrowHead', 'arrowSize', 'lineWidth', 'flowShape', 'flowSize', 'flowSpeed', 'flowDensity', 'flowColor', 'flowColor2'];

export const ARROW_HEADS = [['cone', 'Cone'], ['diamond', 'Diamond'], ['dot', 'Dot'], ['bar', 'Bar']];
export const FLOW_SHAPES = [['sphere', 'Ball'], ['cube', 'Cube'], ['diamond', 'Diamond'], ['dash', 'Dash']];

// min and max are the same limits the server enforces.
export const RANGES = {
  arrowSize: { min: 0.5, max: 3, step: 0.1, label: 'Arrow size' },
  lineWidth: { min: 1, max: 8, step: 0.5, label: 'Line width' },
  flowSize: { min: 0.4, max: 3, step: 0.1, label: 'Dot size' },
  flowSpeed: { min: 0.25, max: 4, step: 0.05, label: 'Speed' },
  flowDensity: { min: 0.25, max: 4, step: 0.05, label: 'How many dots' },
};

export const BUILT_IN = { arrowHead: 'cone', arrowSize: 1, lineWidth: 2.4, flowShape: 'sphere', flowSize: 1, flowSpeed: 1, flowDensity: 1 };

const number = (v, key) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(RANGES[key].max, Math.max(RANGES[key].min, v)) : undefined);
const choice = (v, list) => (list.some(([id]) => id === v) ? v : undefined);

function clean(source) {
  const out = {};
  if (!source) return out;
  const head = choice(source.arrowHead, ARROW_HEADS), shape = choice(source.flowShape, FLOW_SHAPES);
  if (head) out.arrowHead = head;
  if (shape) out.flowShape = shape;
  for (const key of Object.keys(RANGES)) { const v = number(source[key], key); if (v !== undefined) out[key] = v; }
  for (const key of ['flowColor', 'flowColor2']) if (typeof source[key] === 'string' && source[key]) out[key] = source[key];
  return out;
}

// Colours stay out of BUILT_IN: the forward dots follow the line's colour, and the return dots follow the connector's own return colour.
export function resolveStyle(connector, defaults) {
  const own = clean(connector), base = clean(defaults);
  const look = { ...BUILT_IN, ...base, ...own };
  return {
    ...look,
    flowColor: own.flowColor ?? base.flowColor ?? connector.color ?? '#475569',
    flowColor2: own.flowColor2 ?? connector.color2 ?? base.flowColor2 ?? '#f5a524',
  };
}

export const withoutLook = (connector) => {
  const out = { ...connector };
  for (const key of LOOK_KEYS) delete out[key];
  return out;
};

export const hasLook = (connector) => LOOK_KEYS.some((key) => connector[key] !== undefined);

// Merging a change into a set of choices: a value of undefined takes that choice back out.
export function mergeLook(current, patch) {
  const out = { ...current };
  for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete out[key]; else out[key] = value; }
  return out;
}
