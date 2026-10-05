// Minimal structural validation so a bad client can't store garbage or giant blobs.
const SHAPES = ['box', 'cylinder', 'sphere', 'slab', 'user', 'server', 'router', 'accesspoint', 'pc', 'laptop', 'phone', 'database', 'cache', 'switch', 'firewall', 'antenna', 'printer', 'cloud', 'container', 'pyramid'];
const ROUTES = ['orthogonal', 'orthogonal-z', 'straight', 'curved'];
const MAX_ICON = 400_000;

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
const str = (s, max) => typeof s === 'string' && s.length <= max;

export function validateDiagram(d) {
  if (!d || typeof d !== 'object') return 'diagram must be an object';
  const { nodes, connectors, zones } = d;
  if (![nodes, connectors, zones].every(Array.isArray)) return 'nodes, connectors and zones must be arrays';
  if (nodes.length > 2000 || connectors.length > 4000 || zones.length > 500) return 'diagram too large';
  const ids = new Set();
  for (const n of nodes) {
    if (!str(n.id, 64) || !str(n.label, 200) || !str(n.description ?? '', 5000) || !str(n.subtitle ?? '', 200)) return 'bad node';
    if (!SHAPES.includes(n.shape) || !isVec(n.position) || !str(n.color, 32)) return 'bad node';
    if (n.icon != null && !str(n.icon, MAX_ICON)) return 'icon too large';
    if (n.icon && n.icon.startsWith('data:') && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(n.icon)) return 'unsupported icon type';
    ids.add(n.id);
  }
  for (const c of connectors) {
    if (!str(c.id, 64) || !ids.has(c.from) || !ids.has(c.to)) return 'bad connector';
    if (!ROUTES.includes(c.route) || !str(c.label ?? '', 200) || !str(c.color ?? '', 32)) return 'bad connector';
  }
  for (const z of zones) {
    if (!str(z.id, 64) || !str(z.label, 200) || !isVec(z.position) || !isVec(z.size) || !str(z.color, 32)) return 'bad zone';
  }
  return null;
}
