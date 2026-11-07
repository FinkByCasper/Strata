export const LISTS = [['node', 'nodes'], ['connector', 'connectors'], ['zone', 'zones']];

const MAX_OPS = 400;
const MAX_CHARS = 1_000_000;

export function flattenItem(kind, item) {
  if (kind === 'node') return { ...item, position: [item.position[0], 0, item.position[2]] };
  if (kind === 'zone') return { ...item, position: [item.position[0], 0, item.position[2]], size: [item.size[0], 0, item.size[2]] };
  return item;
}

// The style object is small, so a change is found by its content: an absent style and an empty one are the same thing.
export const sameStyle = (a, b) => a === b || JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

export function snapshot(data, name) {
  return { name, style: data.style, maps: Object.fromEntries(LISTS.map(([kind, list]) => [kind, new Map(data[list].map((x) => [x.id, x]))])) };
}

export function diff(shadow, data, name) {
  const ops = [];
  if (name !== shadow.name) ops.push({ op: 'name', name });
  if (!sameStyle(data.style, shadow.style)) ops.push({ op: 'style', item: data.style ?? {} });
  for (const [kind, list] of LISTS) {
    const before = shadow.maps[kind];
    const seen = new Set();
    for (const item of data[list]) {
      seen.add(item.id);
      if (before.get(item.id) !== item) ops.push({ op: 'put', kind, item });
    }
    for (const id of before.keys()) if (!seen.has(id)) ops.push({ op: 'del', kind, id });
  }
  return ops;
}

export function applyToShadow(shadow, ops) {
  for (const o of ops) {
    if (o.op === 'name') shadow.name = o.name;
    else if (o.op === 'style') shadow.style = o.item;
    else if (o.op === 'put') shadow.maps[o.kind].set(o.item.id, o.item);
    else shadow.maps[o.kind].delete(o.id);
  }
}

export function applyOps(data, ops) {
  let next = data;
  const style = ops.findLast((o) => o.op === 'style');
  if (style && !sameStyle(next.style, style.item)) next = { ...next, style: style.item };
  for (const [kind, list] of LISTS) {
    const mine = ops.filter((o) => o.kind === kind);
    if (!mine.length) continue;
    const items = next[list].slice();
    const index = new Map(items.map((x, i) => [x.id, i]));
    let changed = false;
    for (const o of mine) {
      if (o.op === 'put') {
        const at = index.get(o.item.id);
        if (at === undefined) { index.set(o.item.id, items.length); items.push(o.item); } else items[at] = o.item;
        changed = true;
      } else if (index.has(o.id)) {
        items[index.get(o.id)] = null;
        index.delete(o.id);
        changed = true;
      }
    }
    if (changed) next = { ...next, [list]: items.filter(Boolean) };
  }
  return next;
}

export function prepare(ops) {
  return ops.map((o) => (o.op === 'put' ? { ...o, item: flattenItem(o.kind, o.item) } : o));
}

export function chunk(ops) {
  const out = [];
  let current = [], size = 0;
  for (const o of ops) {
    const len = o.op === 'put' ? JSON.stringify(o.item).length : 100;
    if (current.length && (current.length >= MAX_OPS || size + len > MAX_CHARS)) { out.push(current); current = []; size = 0; }
    current.push(o);
    size += len;
  }
  if (current.length) out.push(current);
  return out;
}

export const keyOf = (o) => (o.op === 'name' || o.op === 'style' ? o.op : `${o.kind}:${o.op === 'put' ? o.item.id : o.id}`);
