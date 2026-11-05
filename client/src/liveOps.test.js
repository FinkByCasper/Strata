import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, applyToShadow, chunk, diff, flattenItem, keyOf, prepare, snapshot } from './liveOps.js';

const node = (id, x = 0) => ({ id, label: id, shape: 'box', color: '#fff', position: [x, 0, 0] });
const data = () => ({ nodes: [node('a'), node('b')], connectors: [{ id: 'c', from: 'a', to: 'b', route: 'straight' }], zones: [] });

test('an unchanged diagram produces no operations', () => {
  const d = data();
  assert.deepEqual(diff(snapshot(d, 'x'), d, 'x'), []);
});

test('only entities whose object changed are sent', () => {
  const d = data();
  const shadow = snapshot(d, 'x');
  const next = { ...d, nodes: [{ ...d.nodes[0], label: 'changed' }, d.nodes[1]] };
  assert.deepEqual(diff(shadow, next, 'x').map(keyOf), ['node:a']);
});

test('additions, removals and renames are detected', () => {
  const d = data();
  const shadow = snapshot(d, 'old');
  const next = { nodes: [d.nodes[0], node('new')], connectors: [], zones: [] };
  const ops = diff(shadow, next, 'new name');
  assert.deepEqual(ops.map((o) => `${o.op}:${keyOf(o)}`), ['name:name', 'put:node:new', 'del:node:b', 'del:connector:c']);
});

test('applying the operations to the shadow makes the next diff empty', () => {
  const d = data();
  const shadow = snapshot(d, 'x');
  const next = { nodes: [{ ...d.nodes[0], label: 'z' }, node('n')], connectors: d.connectors, zones: [] };
  applyToShadow(shadow, diff(shadow, next, 'y'));
  assert.deepEqual(diff(shadow, next, 'y'), []);
});

test('applyOps replaces in place, appends new entities and removes deleted ones', () => {
  const d = data();
  const out = applyOps(d, [
    { op: 'put', kind: 'node', item: { ...node('a'), label: 'replaced' } },
    { op: 'put', kind: 'node', item: node('c') },
    { op: 'del', kind: 'node', id: 'b' },
    { op: 'del', kind: 'connector', id: 'missing' },
  ]);
  assert.deepEqual(out.nodes.map((n) => n.id), ['a', 'c']);
  assert.equal(out.nodes[0].label, 'replaced');
  assert.equal(out.connectors, d.connectors);
});

test('applyOps does not touch the input', () => {
  const d = data();
  const before = JSON.stringify(d);
  applyOps(d, [{ op: 'del', kind: 'node', id: 'a' }]);
  assert.equal(JSON.stringify(d), before);
});

test('later operations in one batch win', () => {
  const out = applyOps(data(), [{ op: 'del', kind: 'node', id: 'a' }, { op: 'put', kind: 'node', item: node('a', 9) }]);
  assert.deepEqual(out.nodes.map((n) => [n.id, n.position[0]]), [['b', 0], ['a', 9]]);
});

test('incoming entities are flattened onto the floor like loaded ones', () => {
  assert.deepEqual(flattenItem('node', { ...node('a'), position: [1, 5, 2] }).position, [1, 0, 2]);
  const zone = flattenItem('zone', { id: 'z', position: [1, 3, 2], size: [4, 2, 6] });
  assert.deepEqual([zone.position, zone.size], [[1, 0, 2], [4, 0, 6]]);
  const ops = prepare([{ op: 'put', kind: 'node', item: { ...node('a'), position: [0, 7, 0] } }, { op: 'del', kind: 'node', id: 'b' }]);
  assert.equal(ops[0].item.position[1], 0);
  assert.equal(ops[1].id, 'b');
});

test('large batches are split by count and by size, keeping order', () => {
  const many = Array.from({ length: 950 }, (_, i) => ({ op: 'put', kind: 'node', item: node(`n${i}`) }));
  const parts = chunk(many);
  assert.deepEqual(parts.map((p) => p.length), [400, 400, 150]);
  assert.deepEqual(parts.flat().map((o) => o.item.id), many.map((o) => o.item.id));

  const heavy = Array.from({ length: 6 }, (_, i) => ({ op: 'put', kind: 'node', item: { ...node(`h${i}`), icon: 'x'.repeat(300_000) } }));
  assert.ok(chunk(heavy).length >= 2);
  assert.deepEqual(chunk([]), []);
});
