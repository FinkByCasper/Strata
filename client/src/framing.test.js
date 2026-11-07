import test from 'node:test';
import assert from 'node:assert/strict';
import { aspectOf, measure } from './framing.js';

const node = (x, z) => ({ position: [x, 0, z] });
const zone = (x, z, w, d) => ({ position: [x, 0, z], size: [w, 0, d] });
const AZ = Math.PI / 4;

test('an empty diagram measures a small square', () => {
  const m = measure([], [], AZ);
  assert.deepEqual([m.width, m.height], [14, 14]);
});

test('a single node is never measured smaller than the minimum', () => {
  const m = measure([node(0, 0)], [], AZ);
  assert.equal(m.width, 9);
  assert.equal(m.height, 9);
});

test('a row of nodes along the screen is wider than it is tall', () => {
  const m = measure([node(0, 0), node(20, -20)], [], AZ);
  assert.ok(m.width > m.height * 2);
});

test('looking straight along one axis, a row across the screen looks twice as long as the same row going into it', () => {
  const across = measure([node(0, 0), node(30, 0)], [], 0), into = measure([node(0, 0), node(0, 30)], [], 0);
  assert.ok(across.width > into.width * 1.8);
  assert.ok(into.height > across.height * 1.5);
});

test('zones count by their corners', () => {
  const m = measure([], [zone(0, 0, 10, 10)], 0);
  assert.ok(Math.abs(m.width - (10 + 3)) < 1e-9);
});

test('the shape is kept inside what a page can hold', () => {
  assert.equal(aspectOf([node(0, 0), node(200, -200)], [], AZ), 3);
  assert.equal(aspectOf([node(0, 0), node(0, 0.001)], [], AZ) >= 0.75, true);
  const tall = aspectOf([node(0, 0), node(60, 60)], [], AZ);
  assert.ok(tall >= 0.75 && tall <= 3);
});
