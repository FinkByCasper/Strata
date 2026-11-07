// Text lying on the floor. A label is either free (it is at `position`) or attached to a node or zone, and then it is at `attach.offset`
// from that thing, so it follows it wherever it goes without anything else having to move it.
export const SIZE = { min: 0.5, max: 4, step: 0.1 };
export const DEFAULT_COLOR = { light: '#334155', dark: '#cbd5e1' };

const listFor = (data, type) => (type === 'zone' ? data.zones : data.nodes);

export const anchorOf = (label, data) => (label.attach ? listFor(data, label.attach.type).find((x) => x.id === label.attach.id) ?? null : null);

export function placeOf(label, data) {
  const anchor = anchorOf(label, data);
  return anchor ? [anchor.position[0] + label.attach.offset[0], anchor.position[2] + label.attach.offset[2]] : [label.position[0], label.position[2]];
}

export function moveTo(label, data, x, z) {
  const anchor = anchorOf(label, data);
  if (!anchor) return { ...label, position: [x, 0, z] };
  return { ...label, attach: { ...label.attach, offset: [x - anchor.position[0], 0, z - anchor.position[2]] } };
}

// Attaching keeps the label exactly where it is on screen; detaching likewise. `position` is kept up to date as a record of where it was.
export function attachedTo(label, data, target) {
  const [x, z] = placeOf(label, data);
  const base = { ...label, position: [x, 0, z] };
  delete base.attach;
  if (!target) return base;
  const anchor = listFor(data, target.type).find((o) => o.id === target.id);
  if (!anchor) return base;
  return { ...base, attach: { type: target.type, id: target.id, offset: [x - anchor.position[0], 0, z - anchor.position[2]] } };
}

export const attachedToAny = (label, nodeIds, zoneIds) => !!label.attach && (label.attach.type === 'zone' ? zoneIds : nodeIds).has(label.attach.id);

// Free labels whose spot lies inside a zone: they belong to it as nodes do, and travel with it.
export const freeLabelsIn = (zone, labels) => labels.filter((l) => !l.attach
  && Math.abs(l.position[0] - zone.position[0]) <= zone.size[0] / 2 && Math.abs(l.position[2] - zone.position[2]) <= zone.size[2] / 2);

// A group move: free labels shift, attached ones shift their offset only when the thing they hang on is staying behind.
export function shiftLabels(labels, dx, dz, carry) {
  if (!carry.labels?.size) return labels;
  return labels.map((l) => {
    if (!carry.labels.has(l.id)) return l;
    if (!l.attach) return { ...l, position: [l.position[0] + dx, l.position[1], l.position[2] + dz] };
    if (attachedToAny(l, carry.nodes, carry.zones)) return l;
    return { ...l, attach: { ...l.attach, offset: [l.attach.offset[0] + dx, 0, l.attach.offset[2] + dz] } };
  });
}

export const newLabel = (uid, position, text = 'Text') => ({ id: uid(), text, position: [position[0], 0, position[2]] });

export const lines = (text) => String(text ?? '').split('\n');
