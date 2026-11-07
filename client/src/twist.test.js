import test from 'node:test';
import assert from 'node:assert/strict';
import { TWIST_START, createTwist } from './twist.js';

const around = (deg, r = 100) => [[r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)], [-r * Math.cos((deg * Math.PI) / 180), -r * Math.sin((deg * Math.PI) / 180)]];

function twistBy(t, from, to, steps = 20) {
  let total = 0;
  for (let i = 1; i <= steps; i++) {
    const [a, b] = around(from + ((to - from) * i) / steps);
    total += t.move(1, ...a) + t.move(2, ...b);
  }
  return total;
}

function start(t, deg = 0) {
  const [a, b] = around(deg);
  t.down(1, ...a);
  t.down(2, ...b);
}

test('turning two fingers a quarter turn reports a quarter turn', () => {
  const t = createTwist();
  start(t);
  assert.ok(Math.abs(twistBy(t, 0, 90) - Math.PI / 2) < 1e-9);
});

test('clockwise is positive and anticlockwise negative', () => {
  const a = createTwist(); start(a);
  assert.ok(twistBy(a, 0, 40) > 0);
  const b = createTwist(); start(b);
  assert.ok(twistBy(b, 0, -40) < 0);
});

test('a small wobble while pinching turns nothing', () => {
  const t = createTwist();
  start(t);
  assert.equal(twistBy(t, 0, 4), 0);
  assert.ok(4 * Math.PI / 180 < TWIST_START);
});

test('the wobble is not lost once the twist is real', () => {
  const t = createTwist();
  start(t);
  assert.ok(Math.abs(twistBy(t, 0, 60) - (60 * Math.PI) / 180) < 1e-9);
});

test('one finger, or a finger lifted, never turns the view', () => {
  const t = createTwist();
  t.down(1, 0, 0);
  assert.equal(t.move(1, 50, 50), 0);
  t.down(2, 100, 0);
  t.up(2);
  assert.equal(t.move(1, 80, 80), 0);
});

test('crossing the half-turn boundary does not jump', () => {
  const t = createTwist();
  start(t, 170);
  assert.ok(Math.abs(twistBy(t, 170, 190) - (20 * Math.PI) / 180) < 1e-9);
});

test('a second gesture starts fresh', () => {
  const t = createTwist();
  start(t);
  twistBy(t, 0, 50);
  t.up(1); t.up(2);
  start(t, 90);
  assert.equal(twistBy(t, 90, 93), 0);
});
