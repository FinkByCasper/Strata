import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClip, describe, materialize, snapAnchor } from './clipboard.js';
import { NOTHING, everything, groupContents, pickedOf, pruned, rectPick, refsOf, selectionState, shared, summary, toggled } from './selection.js';

const node = (id, x, z) => ({ id, label: id, shape: 'box', color: '#fff', position: [x, 0, z] });
const zone = (id, x, z, w, d) => ({ id, label: id, color: '#fff', position: [x, 0, z], size: [w, 0, d] });
const link = (id, from, to) => ({ id, from, to, route: 'straight' });
const ref = (type, id) => ({ type, id });

const data = () => ({
  nodes: [node('a', 0, 0), node('b', 3, 0), node('c', 6, 0), node('in', 20, 20), node('out', 40, 40)],
  zones: [zone('z', 20, 20, 6, 6), zone('small', 21, 21, 2, 2), zone('far', 60, 60, 4, 4)],
  connectors: [link('ab', 'a', 'b'), link('bc', 'b', 'c'), link('ac', 'a', 'c'), link('z-out', 'in', 'out')],
});

test('one chosen thing is a plain selection, several are a group', () => {
  const one = selectionState([ref('node', 'a')]);
  assert.deepEqual(one.selection, ref('node', 'a'));
  assert.deepEqual(one.multi, []);
  const many = selectionState([ref('node', 'a'), ref('zone', 'z')]);
  assert.deepEqual(many.selection, ref('zone', 'z'));
  assert.equal(many.multi.length, 2);
  assert.ok(many.picked.node.has('a') && many.picked.zone.has('z'));
  assert.equal(selectionState([]).picked, NOTHING);
  assert.equal(selectionState([]).selection, null);
});

test('the same thing twice counts once', () => {
  assert.equal(selectionState([ref('node', 'a'), ref('node', 'a')]).multi.length, 0);
  assert.equal(selectionState([ref('node', 'a'), ref('node', 'b'), ref('node', 'a')]).multi.length, 2);
});

test('toggling adds, then removes, and a node and a zone with one id are different things', () => {
  let refs = [];
  refs = toggled(refs, ref('node', 'x'));
  refs = toggled(refs, ref('zone', 'x'));
  assert.equal(refs.length, 2);
  refs = toggled(refs, ref('node', 'x'));
  assert.deepEqual(refs, [ref('zone', 'x')]);
});

test('refsOf reads the group first, then the single selection', () => {
  assert.deepEqual(refsOf({ multi: [], selection: null }), []);
  assert.deepEqual(refsOf({ multi: [], selection: ref('node', 'a') }), [ref('node', 'a')]);
  assert.equal(refsOf({ multi: [ref('node', 'a'), ref('node', 'b')], selection: ref('node', 'b') }).length, 2);
});

test('things that no longer exist drop out of a selection', () => {
  const refs = [ref('node', 'a'), ref('node', 'gone'), ref('zone', 'z'), ref('connector', 'ab'), ref('connector', 'nope')];
  assert.deepEqual(pruned(refs, data()), [ref('node', 'a'), ref('zone', 'z'), ref('connector', 'ab')]);
});

test('select all takes every node, zone and connector', () => {
  const d = data();
  assert.equal(everything(d).length, d.nodes.length + d.zones.length + d.connectors.length);
});

test('dragging a group also takes what is inside its zones, once', () => {
  const picked = pickedOf([ref('node', 'a'), ref('node', 'in'), ref('zone', 'z')]);
  const carry = groupContents(data(), picked);
  assert.deepEqual([...carry.nodes].sort(), ['a', 'in']);
  assert.deepEqual([...carry.zones].sort(), ['small', 'z']);
});

test('dragging a plain group moves exactly what was chosen', () => {
  const carry = groupContents(data(), pickedOf([ref('node', 'a'), ref('node', 'b')]));
  assert.deepEqual([...carry.nodes].sort(), ['a', 'b']);
  assert.equal(carry.zones.size, 0);
});

const grid = (x, y, z) => [x * 10 + 500, z * 10 + 500];   // a flat top view: ten pixels per grid square

test('a rectangle picks nodes by their centre', () => {
  const picked = rectPick(data(), grid, { left: 495, right: 535, top: 495, bottom: 505 });
  assert.deepEqual(picked.filter((r) => r.type === 'node').map((r) => r.id), ['a', 'b']);
});

test('a rectangle takes a zone only when the whole zone is inside', () => {
  const some = rectPick(data(), grid, { left: 690, right: 710, top: 690, bottom: 710 });
  assert.equal(some.some((r) => r.type === 'zone'), false);
  const all = rectPick(data(), grid, { left: 650, right: 750, top: 650, bottom: 750 });
  assert.deepEqual(all.filter((r) => r.type === 'zone').map((r) => r.id).sort(), ['small', 'z']);
});

test('a rectangle takes the connectors between the chosen nodes and no others', () => {
  const picked = rectPick(data(), grid, { left: 495, right: 575, top: 495, bottom: 505 });
  assert.deepEqual(picked.filter((r) => r.type === 'connector').map((r) => r.id).sort(), ['ab', 'ac', 'bc']);
  const two = rectPick(data(), grid, { left: 495, right: 535, top: 495, bottom: 505 });
  assert.deepEqual(two.filter((r) => r.type === 'connector').map((r) => r.id), ['ab']);
});

test('an empty rectangle picks nothing', () => {
  assert.deepEqual(rectPick(data(), grid, { left: 0, right: 10, top: 0, bottom: 10 }), []);
});

test('the summary counts each kind', () => {
  assert.equal(summary(pickedOf([ref('node', 'a'), ref('node', 'b'), ref('zone', 'z'), ref('connector', 'ab')])), '2 nodes · 1 zone · 1 connection');
  assert.equal(summary(pickedOf([ref('node', 'a')])), '1 node');
});

test('a shared value is only reported when every item has it', () => {
  assert.equal(shared([{ c: 'x' }, { c: 'x' }], 'c'), 'x');
  assert.equal(shared([{ c: 'x' }, { c: 'y' }], 'c'), null);
  assert.equal(shared([], 'c'), null);
});

test('copying several things takes the chosen ones, the insides of chosen zones and the connectors between them', () => {
  const clip = buildClip(data(), [ref('node', 'a'), ref('node', 'b'), ref('zone', 'z')]);
  assert.equal(clip.type, 'group');
  assert.deepEqual(clip.nodes.map((n) => n.id).sort(), ['a', 'b', 'in']);
  assert.deepEqual(clip.zones.map((z) => z.id).sort(), ['small', 'z']);
  assert.deepEqual(clip.connectors.map((c) => c.id), ['ab']);
  assert.equal(describe(clip), '5 items');
});

test('copying one thing from a list of one still copies it as itself', () => {
  assert.equal(buildClip(data(), [ref('node', 'a')]).type, 'node');
  assert.equal(buildClip(data(), [ref('connector', 'ab')]), null);
  assert.equal(buildClip(data(), [ref('connector', 'ab'), ref('connector', 'bc')]), null);
});

test('a pasted group keeps its shape, with new ids and connectors that follow', () => {
  const clip = buildClip(data(), [ref('node', 'a'), ref('node', 'b'), ref('node', 'c')]);
  const made = materialize(clip, 0, 5);
  assert.deepEqual(made.nodes.map((n) => [n.position[0], n.position[2]]), [[0, 5], [3, 5], [6, 5]]);
  assert.ok(made.nodes.every((n) => !['a', 'b', 'c'].includes(n.id)));
  const ids = new Set(made.nodes.map((n) => n.id));
  assert.equal(made.connectors.length, 3);
  assert.ok(made.connectors.every((c) => ids.has(c.from) && ids.has(c.to)));
  assert.equal(made.all.length, 6);
  assert.equal(made.main, null);
});

test('a group lands with its middle on the mouse', () => {
  const clip = buildClip(data(), [ref('node', 'a'), ref('node', 'c')]);
  assert.deepEqual(clip.anchor, [3, 0]);
  assert.deepEqual(snapAnchor(clip, 10, 4), [10, 4]);
  assert.equal(clip.span[0], 6);
});
