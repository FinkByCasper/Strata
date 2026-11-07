import test from 'node:test';
import assert from 'node:assert/strict';
import { attachedTo, attachedToAny, freeLabelsIn, moveTo, newLabel, placeOf, shiftLabels } from './textLabels.js';
import { buildClip, describe, materialize } from './clipboard.js';
import { everything, groupContents, pickedOf, rectPick, summary } from './selection.js';
import { zoneContents } from './zones.js';
import { applyOps, diff, flattenItem, snapshot } from './liveOps.js';
import { flatten } from './model.js';

const node = (id, x, z) => ({ id, label: id, shape: 'box', color: '#fff', position: [x, 0, z] });
const zone = (id, x, z, w, d) => ({ id, label: id, color: '#fff', position: [x, 0, z], size: [w, 0, d] });
const free = (id, x, z) => ({ id, text: id, position: [x, 0, z] });
const hung = (id, type, on, dx, dz) => ({ id, text: id, position: [0, 0, 0], attach: { type, id: on, offset: [dx, 0, dz] } });
const data = (extra = {}) => ({ nodes: [node('a', 0, 0), node('b', 10, 0)], zones: [zone('z', 20, 20, 6, 6)], connectors: [], labels: [], ...extra });

test('a free label is where it says, an attached one is its anchor plus the offset and follows it', () => {
  const d = data({ labels: [free('f', 3, 4), hung('on', 'node', 'a', 1, -2), hung('inZone', 'zone', 'z', 0, 1)] });
  assert.deepEqual(placeOf(d.labels[0], d), [3, 4]);
  assert.deepEqual(placeOf(d.labels[1], d), [1, -2]);
  d.nodes[0] = node('a', 5, 5);
  assert.deepEqual(placeOf(d.labels[1], d), [6, 3]);
  assert.deepEqual(placeOf(d.labels[2], d), [20, 21]);
});

test('moving an attached label changes only its offset, a free one its position', () => {
  const d = data({ labels: [free('f', 3, 4), hung('on', 'node', 'b', 1, 1)] });
  assert.deepEqual(moveTo(d.labels[0], d, 7, 8).position, [7, 0, 8]);
  const moved = moveTo(d.labels[1], d, 12, 5);
  assert.deepEqual(moved.attach.offset, [2, 0, 5]);
  assert.deepEqual(moved.position, d.labels[1].position);
  assert.deepEqual(placeOf(moved, d), [12, 5]);
});

test('attaching and letting go keep the text where it is on screen', () => {
  const d = data({ labels: [free('f', 12, 3)] });
  const on = attachedTo(d.labels[0], d, { type: 'node', id: 'b' });
  assert.deepEqual(on.attach, { type: 'node', id: 'b', offset: [2, 0, 3] });
  assert.deepEqual(placeOf(on, d), [12, 3]);
  const off = attachedTo({ ...on }, { ...d, nodes: [node('a', 0, 0), node('b', 14, 0)] }, null);
  assert.equal(off.attach, undefined);
  assert.deepEqual(off.position, [16, 0, 3]);
  assert.deepEqual(attachedTo(d.labels[0], d, { type: 'node', id: 'gone' }).attach, undefined);
});

test('free text inside a zone belongs to it, text on or outside it does not', () => {
  const z = zone('z', 20, 20, 6, 6);
  const found = freeLabelsIn(z, [free('in', 21, 19), free('edge', 23, 23), free('out', 30, 20), hung('on', 'node', 'a', 20, 20)]).map((l) => l.id);
  assert.deepEqual(found, ['in', 'edge']);
  assert.deepEqual([...zoneContents(z, data({ labels: [free('in', 21, 19), free('out', 0, 0)] })).labels], ['in']);
});

test('a group move shifts free text, and shifts attached text only when what it hangs on stays behind', () => {
  const labels = [free('f', 0, 0), hung('stays', 'node', 'a', 1, 1), hung('goes', 'node', 'b', 1, 1), free('other', 5, 5)];
  const carry = { nodes: new Set(['b']), zones: new Set(), labels: new Set(['f', 'stays', 'goes']) };
  const out = shiftLabels(labels, 3, -2, carry);
  assert.deepEqual(out[0].position, [3, 0, -2]);
  assert.deepEqual(out[1].attach.offset, [4, 0, -1]);
  assert.equal(out[2], labels[2]);
  assert.equal(out[3], labels[3]);
  assert.equal(shiftLabels(labels, 1, 1, { nodes: new Set(), zones: new Set() }), labels);
});

test('attachment is recognised for nodes and zones separately', () => {
  assert.equal(attachedToAny(hung('x', 'zone', 'z', 0, 0), new Set(['z']), new Set()), false);
  assert.equal(attachedToAny(hung('x', 'zone', 'z', 0, 0), new Set(), new Set(['z'])), true);
  assert.equal(attachedToAny(free('x', 0, 0), new Set(['a']), new Set(['z'])), false);
});

test('a group takes the picked text and the free text inside its zones along', () => {
  const d = data({ labels: [free('in', 21, 21), free('picked', 50, 50), free('left', 60, 60)] });
  const carry = groupContents(d, { ...pickedOf([{ type: 'zone', id: 'z' }, { type: 'label', id: 'picked' }]) });
  assert.deepEqual([...carry.labels].sort(), ['in', 'picked']);
});

test('select all and the box select include text, and the summary counts it', () => {
  const d = data({ labels: [free('t', 3, 0), free('far', 90, 90)] });
  assert.equal(everything(d).filter((r) => r.type === 'label').length, 2);
  const grid = (x, y, z) => [x * 10 + 500, z * 10 + 500];
  const picked = rectPick(d, grid, { left: 480, right: 560, top: 490, bottom: 510 });
  assert.deepEqual(picked.filter((r) => r.type === 'label').map((r) => r.id), ['t']);
  assert.equal(summary(pickedOf([{ type: 'label', id: 't' }, { type: 'label', id: 'u' }, { type: 'node', id: 'a' }])), '1 node · 2 texts');
});

test('copying a node takes its text with it, and a pasted copy keeps the text on the new node', () => {
  const d = data({ labels: [hung('mine', 'node', 'a', 1, 1), hung('other', 'node', 'b', 1, 1), free('free', 0, 1)] });
  const clip = buildClip(d, { type: 'node', id: 'a' });
  assert.deepEqual(clip.labels.map((l) => l.id), ['mine']);
  const made = materialize(clip, 5, 5);
  assert.equal(made.labels.length, 1);
  assert.equal(made.labels[0].attach.id, made.nodes[0].id);
  assert.notEqual(made.labels[0].id, 'mine');
  assert.deepEqual(made.labels[0].attach.offset, [1, 0, 1]);
});

test('copying a zone takes the text on it and the text hung on what is in it', () => {
  const d = data({
    nodes: [node('in', 20, 20)],
    labels: [free('onFloor', 21, 21), hung('onNode', 'node', 'in', 0, 1), hung('onZone', 'zone', 'z', 0, 0), free('outside', 0, 0)],
  });
  const clip = buildClip(d, { type: 'zone', id: 'z' });
  assert.deepEqual(clip.labels.map((l) => l.id).sort(), ['onFloor', 'onNode', 'onZone']);
  const made = materialize(clip, 4, 0);
  const byText = Object.fromEntries(made.labels.map((l) => [l.text, l]));
  assert.deepEqual(byText.onFloor.position, [25, 0, 21]);
  assert.equal(byText.onNode.attach.id, made.nodes[0].id);
  assert.equal(byText.onZone.attach.id, made.zones[0].id);
});

test('copying one piece of text copies just it; attached to something not copied, it moves with the paste', () => {
  const d = data({ labels: [free('f', 3, 4), hung('on', 'node', 'a', 1, 1)] });
  const clip = buildClip(d, { type: 'label', id: 'on' });
  assert.equal(clip.type, 'label');
  assert.deepEqual(clip.anchor, [1, 1]);
  const made = materialize(clip, 2, 3);
  assert.equal(made.labels[0].attach.id, 'a');
  assert.deepEqual(made.labels[0].attach.offset, [3, 0, 4]);
  assert.deepEqual(made.main, { type: 'label', id: made.labels[0].id });
  assert.equal(describe(buildClip(d, { type: 'label', id: 'f' })), '“f”');
});

test('a group copy counts and carries its text', () => {
  const d = data({ labels: [free('f', 3, 4)] });
  const clip = buildClip(d, [{ type: 'node', id: 'a' }, { type: 'label', id: 'f' }]);
  assert.equal(clip.type, 'group');
  assert.equal(clip.labels.length, 1);
  assert.equal(describe(clip), '2 items');
  assert.equal(buildClip(d, [{ type: 'label', id: 'f' }]).type, 'label');
});

test('old diagrams without text load with an empty list, and flat positions', () => {
  const loaded = flatten({ nodes: [], connectors: [], zones: [] });
  assert.deepEqual(loaded.labels, []);
  const withText = flatten({ nodes: [], connectors: [], zones: [], labels: [{ id: 't', text: 'x', position: [1, 5, 2], attach: { type: 'node', id: 'a', offset: [1, 9, 1] } }] });
  assert.deepEqual(withText.labels[0].position, [1, 0, 2]);
  assert.deepEqual(withText.labels[0].attach.offset, [1, 0, 1]);
  assert.deepEqual(flattenItem('label', free('x', 1, 2)).position, [1, 0, 2]);
});

test('text takes part in live editing like everything else', () => {
  const base = flatten({ nodes: [], connectors: [], zones: [] });
  const shadow = snapshot(base, 'd');
  const next = { ...base, labels: [free('t', 1, 1)] };
  const ops = diff(shadow, next, 'd');
  assert.deepEqual(ops, [{ op: 'put', kind: 'label', item: next.labels[0] }]);
  assert.equal(applyOps(base, ops).labels.length, 1);
  assert.equal(applyOps(next, [{ op: 'del', kind: 'label', id: 't' }]).labels.length, 0);
  assert.equal(newLabel(() => 'id', [3, 9, 4]).position[1], 0);
});
