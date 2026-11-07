import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN, LOOK_KEYS, hasLook, mergeLook, resolveStyle, withoutLook } from './connectorStyle.js';

const link = (extra = {}) => ({ id: 'c', from: 'a', to: 'b', color: '#336699', ...extra });

test('with nothing set, a connector looks exactly as connectors always have', () => {
  const s = resolveStyle(link(), undefined);
  assert.deepEqual({ ...s, flowColor: null, flowColor2: null }, { ...BUILT_IN, flowColor: null, flowColor2: null });
  assert.equal(s.flowColor, '#336699');
  assert.equal(s.flowColor2, '#f5a524');
});

test('the connector wins over the diagram default, which wins over the built-in value', () => {
  const defaults = { arrowHead: 'dot', lineWidth: 5, flowShape: 'cube' };
  const s = resolveStyle(link({ lineWidth: 2 }), defaults);
  assert.equal(s.lineWidth, 2);
  assert.equal(s.arrowHead, 'dot');
  assert.equal(s.flowShape, 'cube');
  assert.equal(s.flowSpeed, 1);
});

test('forward dots follow the line colour unless a colour was chosen, and the return colour keeps its own order of precedence', () => {
  assert.equal(resolveStyle(link(), { flowColor: '#111111' }).flowColor, '#111111');
  assert.equal(resolveStyle(link({ flowColor: '#222222' }), { flowColor: '#111111' }).flowColor, '#222222');
  assert.equal(resolveStyle(link({ color2: '#aa0000' }), { flowColor2: '#00aa00' }).flowColor2, '#aa0000');
  assert.equal(resolveStyle(link({ flowColor2: '#0000aa', color2: '#aa0000' }), { flowColor2: '#00aa00' }).flowColor2, '#0000aa');
  assert.equal(resolveStyle(link(), { flowColor2: '#00aa00' }).flowColor2, '#00aa00');
});

test('numbers are held to the same limits the server enforces', () => {
  const s = resolveStyle(link({ arrowSize: 99, lineWidth: 0, flowSize: -4, flowSpeed: 100, flowDensity: 0.01 }), undefined);
  assert.deepEqual([s.arrowSize, s.lineWidth, s.flowSize, s.flowSpeed, s.flowDensity], [3, 1, 0.4, 4, 0.25]);
});

test('values that are not understood fall back instead of breaking the drawing', () => {
  const s = resolveStyle(link({ arrowHead: 'spike', flowShape: 7, arrowSize: 'big', lineWidth: NaN, flowColor: 5 }), { arrowHead: null, flowSpeed: '2' });
  assert.equal(s.arrowHead, 'cone');
  assert.equal(s.flowShape, 'sphere');
  assert.equal(s.arrowSize, 1);
  assert.equal(s.lineWidth, 2.4);
  assert.equal(s.flowSpeed, 1);
  assert.equal(s.flowColor, '#336699');
});

test('a missing or empty set of defaults is fine', () => {
  for (const d of [undefined, null, {}, { connector: {} }]) assert.equal(resolveStyle(link(), d).lineWidth, 2.4);
});

test('clearing a connector removes only its look, nothing else', () => {
  const c = link({ label: 'x', route: 'straight', arrowSize: 2, flowShape: 'dash' });
  const clear = withoutLook(c);
  assert.equal(hasLook(c), true);
  assert.equal(hasLook(clear), false);
  assert.equal(clear.label, 'x');
  assert.equal(clear.color, '#336699');
  assert.ok(LOOK_KEYS.every((k) => !(k in clear)));
});

test('merging a change adds, replaces, and with undefined takes a choice back out', () => {
  const merged = mergeLook({ lineWidth: 3, arrowHead: 'dot' }, { lineWidth: 5, flowShape: 'cube', arrowHead: undefined });
  assert.deepEqual(merged, { lineWidth: 5, flowShape: 'cube' });
  assert.deepEqual(mergeLook(undefined, { lineWidth: 2 }), { lineWidth: 2 });
});
