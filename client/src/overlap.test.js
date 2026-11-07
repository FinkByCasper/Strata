import test from 'node:test';
import assert from 'node:assert/strict';
import { clash, nearestFree, occupant, swapPlan } from './overlap.js';

const node = (id, x, z) => ({ id, position: [x, 0, z] });

test('a node is found by the square it is on, however its position is rounded', () => {
  const nodes = [node('a', 2, 3), node('b', 5.2, 1.9)];
  assert.equal(occupant(nodes, [2, 0, 3]).id, 'a');
  assert.equal(occupant(nodes, [5, 0, 2]).id, 'b');
  assert.equal(occupant(nodes, [9, 0, 9]), null);
  assert.equal(occupant(nodes, [2, 0, 3], new Set(['a'])), null);
});

test('dropping a node onto another sends the other one back to where the first started', () => {
  const nodes = [node('a', 6, 0), node('b', 6, 0)];
  assert.deepEqual(swapPlan(nodes, 'a', [0, 0]), { id: 'b', position: [0, 0, 0] });
});

test('dropping a node on an empty square changes nothing', () => {
  assert.equal(swapPlan([node('a', 1, 1), node('b', 4, 4)], 'a', [0, 0]), null);
  assert.equal(swapPlan([node('a', 1, 1)], 'gone', [0, 0]), null);
});

test('after a swap no two nodes share a square', () => {
  const nodes = [node('a', 6, 0), node('b', 6, 0), node('c', 0, 6)];
  const plan = swapPlan(nodes, 'a', [0, 0]);
  const after = nodes.map((n) => (n.id === plan.id ? { ...n, position: plan.position } : n));
  assert.equal(new Set(after.map((n) => n.position.join())).size, 3);
});

test('a group that lands on a node it did not bring along is a clash, one that lands on empty floor is not', () => {
  const nodes = [node('a', 0, 0), node('b', 3, 0), node('stay', 0, 0)];
  assert.equal(clash(nodes, new Set(['a', 'b'])), true);
  assert.equal(clash([node('a', 0, 0), node('b', 3, 0), node('stay', 9, 9)], new Set(['a', 'b'])), false);
  assert.equal(clash([node('a', 0, 0), node('b', 0, 0)], new Set(['a', 'b'])), false);
});

test('the closest free square is found by searching outwards', () => {
  assert.deepEqual(nearestFree([], [2, 3]), [2, 3]);
  const nodes = [node('a', 2, 3)];
  const [x, z] = nearestFree(nodes, [2, 3]);
  assert.ok(Math.max(Math.abs(x - 2), Math.abs(z - 3)) === 1);
  const ring = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ring.push(node(`n${dx}${dz}`, dx, dz));
  const free = nearestFree(ring, [0, 0]);
  assert.equal(Math.max(Math.abs(free[0]), Math.abs(free[1])), 2);
});
