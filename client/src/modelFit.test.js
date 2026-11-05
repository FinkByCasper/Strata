import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, clampScale, fit, labelHeight, rotationDegrees } from './modelFit.js';
import { cleanBundle, fromBase64, remapModels, toBase64, usedModelIds } from './modelBundle.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('the longest side becomes one cell, whatever unit the model was made in', () => {
  const metres = fit([0, 0, 0], [2, 1, 1]);
  const millimetres = fit([0, 0, 0], [2000, 1000, 1000]);
  near(Math.max(...metres.size), 1);
  assert.deepEqual(metres.size.map((v) => +v.toFixed(9)), millimetres.size.map((v) => +v.toFixed(9)));
});

test('the model is centred on the cell and stands on the floor', () => {
  const f = fit([-3, 2, 10], [-1, 6, 14]);
  near(((-3 + -1) / 2) * f.k + f.offset[0], 0);
  near(((10 + 14) / 2) * f.k + f.offset[2], 0);
  near(2 * f.k + f.offset[1], FLOOR);
});

test('the node scale multiplies the fitted size and is kept in range', () => {
  near(fit([0, 0, 0], [1, 1, 1], 2.5).size[0], 2.5);
  near(fit([0, 0, 0], [1, 1, 1], 1000).size[0], 100);
  near(fit([0, 0, 0], [1, 1, 1], -4).size[0], 0.01);
  assert.equal(clampScale(undefined), 1);
  assert.equal(clampScale(NaN), 1);
});

test('an empty or flat-point model cannot be fitted', () => {
  assert.equal(fit([0, 0, 0], [0, 0, 0]), null);
  assert.equal(fit([Infinity, 0, 0], [-Infinity, 0, 0]), null);
});

test('the label sits above the top of the model', () => {
  const tall = fit([0, 0, 0], [1, 4, 1]);
  near(labelHeight(tall), FLOOR + 1 + 0.25);
  assert.equal(labelHeight(fit([0, 0, 0], [4, 0.01, 4])), 0.35);
});

test('rotation defaults to none and ignores rubbish', () => {
  assert.deepEqual(rotationDegrees({}), [0, 0, 0]);
  assert.deepEqual(rotationDegrees({ modelRotation: [1, 'x', 3] }), [1, 0, 3]);
  assert.deepEqual(rotationDegrees({ modelRotation: [1, 2] }), [0, 0, 0]);
  assert.deepEqual(rotationDegrees({ modelRotation: [0, 90, 0] }), [0, 90, 0]);
});

test('base64 round-trips binary data, including big files', () => {
  const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31) % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.equal(toBase64(new Uint8Array()), '');
});

test('nodes follow their models to new ids, other nodes are left alone', () => {
  const data = { nodes: [{ id: 'a', shape: 'model', modelId: 'old' }, { id: 'b', shape: 'box', modelId: 'old' }, { id: 'c', shape: 'model', modelId: 'other' }], connectors: [], zones: [] };
  const out = remapModels(data, new Map([['old', 'new']]));
  assert.deepEqual(out.nodes.map((n) => n.modelId), ['new', 'old', 'other']);
  assert.equal(remapModels(data, new Map()), data);
  assert.equal(data.nodes[0].modelId, 'old');
});

test('only models that nodes really use are bundled', () => {
  const data = { nodes: [{ shape: 'model', modelId: 'x' }, { shape: 'model', modelId: 'x' }, { shape: 'box', modelId: 'y' }, { shape: 'model' }], connectors: [], zones: [] };
  assert.deepEqual(usedModelIds(data), ['x']);
});

test('a bundle from an import file is cleaned', () => {
  assert.deepEqual(cleanBundle(undefined), []);
  assert.deepEqual(cleanBundle('x'), []);
  assert.deepEqual(cleanBundle([{ id: 'a', name: 'n', data: 'AAAA' }, { id: 1, data: 'x' }, null, { id: 'b', data: 'BBBB' }, { id: 'c' }]), [{ id: 'a', name: 'n', data: 'AAAA' }, { id: 'b', name: 'model', data: 'BBBB' }]);
});
