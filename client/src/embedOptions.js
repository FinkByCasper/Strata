// What an embed can be told through its URL, and the reverse: building the URL and the snippet for the Share dialog.
// Anything left out of the URL means "as before", so old embed links keep working unchanged.
export const DEFAULTS = { angle: 0, zoom: 1, toolbar: 'auto', theme: null, highlight: [], transparent: false, interact: 'click' };

const word = (v) => String(v ?? '').trim().toLowerCase();
const number = (v) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null; };
const HIDDEN = new Set(['0', 'false', 'no', 'none', 'hidden', 'off']);
const SHOWN = new Set(['1', 'true', 'yes', 'show', 'shown', 'visible', 'always', 'on']);

export function parseEmbed(search) {
  const q = new URLSearchParams(search);
  const out = { ...DEFAULTS, highlight: [] };

  const angle = number(q.get('angle'));
  if (angle !== null) out.angle = ((angle % 360) + 360) % 360;

  const zoom = number(q.get('zoom'));
  if (zoom !== null && zoom > 0) out.zoom = Math.min(4, Math.max(0.25, zoom));

  const toolbar = word(q.get('toolbar'));
  if (HIDDEN.has(toolbar)) out.toolbar = 'hidden';
  else if (SHOWN.has(toolbar)) out.toolbar = 'visible';

  const theme = word(q.get('theme'));
  if (theme === 'light' || theme === 'dark') out.theme = theme;
  else if (theme === 'auto' || theme === 'system') out.theme = 'auto';

  out.transparent = word(q.get('bg')) === 'transparent';
  if (word(q.get('interact')) === 'always') out.interact = 'always';

  out.highlight = q.getAll('highlight').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  return out;
}

// Nodes are found by id first, then by name without regard to capitals; a name that matches several nodes highlights all of them.
export function resolveHighlight(names, nodes) {
  const ids = new Set();
  for (const name of names) {
    const byId = nodes.find((n) => n.id === name);
    if (byId) { ids.add(byId.id); continue; }
    const wanted = name.toLowerCase();
    for (const n of nodes) if ((n.label ?? '').trim().toLowerCase() === wanted) ids.add(n.id);
  }
  return [...ids];
}

export function embedQuery(opts) {
  const o = { ...DEFAULTS, ...opts };
  const q = new URLSearchParams();
  if (o.angle) q.set('angle', String(o.angle));
  if (o.zoom !== 1) q.set('zoom', String(o.zoom));
  if (o.toolbar === 'hidden') q.set('toolbar', '0');
  else if (o.toolbar === 'visible') q.set('toolbar', '1');
  if (o.theme) q.set('theme', o.theme);
  if (o.transparent) q.set('bg', 'transparent');
  if (o.interact === 'always') q.set('interact', 'always');
  for (const h of o.highlight) q.append('highlight', h);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const attr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// `responsive` makes the frame as wide as its column and lets the diagram choose the height; `fixed` is a plain iframe.
export function embedSnippet({ origin, token, opts, responsive = true, width = 800, height = 500 }) {
  const src = attr(`${origin}/embed/${token}${embedQuery(opts)}`);
  if (!responsive) return `<iframe src="${src}" width="${width}" height="${height}" style="border:0" allowfullscreen></iframe>`;
  return `<iframe src="${src}" width="100%" height="${height}" style="border:0" allowfullscreen data-strata-embed></iframe>\n<script src="${attr(origin)}/embed.js" async></script>`;
}
