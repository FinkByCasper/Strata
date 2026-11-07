import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROUTES, isDrawable, routePoints, routedPoints, sameSpot } from './model.js';

test('a connector between two nodes on the same square is not drawable, in every routing style', () => {
  for (const route of ROUTES) {
    let pts;
    assert.doesNotThrow(() => { pts = routePoints([3, 0, 3], [3, 0, 3], route); }, route);
    if (route !== 'curved') assert.equal(isDrawable(pts), false, route);
  }
  assert.equal(sameSpot([3, 0, 3], [3, 4, 3]), true);
  assert.equal(sameSpot([3, 0, 3], [3, 0, 3.5]), false);
  assert.equal(isDrawable(routedPoints([[3, 3]], 0)), false);
  assert.equal(isDrawable(routedPoints([[3, 3], [3, 3]], 0)), false);
});

test('connectors between separate squares are drawable, and so are nodes only a step apart', () => {
  for (const route of ROUTES) assert.equal(isDrawable(routePoints([0, 0, 0], [6, 0, 0], route)), true, route);
  assert.equal(isDrawable(routePoints([0, 0, 0], [1, 0, 0], 'straight')), true);
  assert.equal(isDrawable([new THREE.Vector3(0, 0, 0)]), false);
  assert.equal(isDrawable([]), false);
});
