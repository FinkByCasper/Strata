import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, embedQuery, embedSnippet, parseEmbed, resolveHighlight } from './embedOptions.js';

test('an embed with no options behaves exactly as before', () => {
  assert.deepEqual(parseEmbed(''), DEFAULTS);
  assert.deepEqual(parseEmbed('?unknown=1&x'), DEFAULTS);
});

test('the angle is a turn in degrees, kept within one full circle', () => {
  assert.equal(parseEmbed('?angle=90').angle, 90);
  assert.equal(parseEmbed('?angle=-90').angle, 270);
  assert.equal(parseEmbed('?angle=450').angle, 90);
  assert.equal(parseEmbed('?angle=abc').angle, 0);
  assert.equal(parseEmbed('?angle=').angle, 0);
});

test('zoom is a multiplier kept to a sane range, and nonsense is ignored', () => {
  assert.equal(parseEmbed('?zoom=1.5').zoom, 1.5);
  assert.equal(parseEmbed('?zoom=100').zoom, 4);
  assert.equal(parseEmbed('?zoom=0.01').zoom, 0.25);
  assert.equal(parseEmbed('?zoom=0').zoom, 1);
  assert.equal(parseEmbed('?zoom=-2').zoom, 1);
});

test('the toolbar can be hidden or kept in view, in several spellings', () => {
  for (const v of ['0', 'false', 'hidden', 'none', 'HIDDEN']) assert.equal(parseEmbed(`?toolbar=${v}`).toolbar, 'hidden');
  for (const v of ['1', 'true', 'show', 'visible']) assert.equal(parseEmbed(`?toolbar=${v}`).toolbar, 'visible');
  assert.equal(parseEmbed('?toolbar=maybe').toolbar, 'auto');
});

test('the theme is light, dark or the visitor\'s own', () => {
  assert.equal(parseEmbed('?theme=dark').theme, 'dark');
  assert.equal(parseEmbed('?theme=Light').theme, 'light');
  assert.equal(parseEmbed('?theme=auto').theme, 'auto');
  assert.equal(parseEmbed('?theme=system').theme, 'auto');
  assert.equal(parseEmbed('?theme=pink').theme, null);
});

test('only bg=transparent makes the background transparent', () => {
  assert.equal(parseEmbed('?bg=transparent').transparent, true);
  assert.equal(parseEmbed('?bg=red').transparent, false);
  assert.equal(parseEmbed('').transparent, false);
});

test('scroll is held back until the viewer clicks, unless the page asks otherwise', () => {
  assert.equal(parseEmbed('').interact, 'click');
  assert.equal(parseEmbed('?interact=always').interact, 'always');
  assert.equal(parseEmbed('?interact=whatever').interact, 'click');
});

test('highlight takes repeated parameters and comma lists, and ignores blanks', () => {
  assert.deepEqual(parseEmbed('?highlight=NAS&highlight=Router').highlight, ['NAS', 'Router']);
  assert.deepEqual(parseEmbed('?highlight=NAS,%20Router,,').highlight, ['NAS', 'Router']);
  assert.deepEqual(parseEmbed('?highlight=').highlight, []);
});

const nodes = [{ id: 'a1', label: 'NAS' }, { id: 'b2', label: 'Router' }, { id: 'c3', label: 'nas' }, { id: 'nas', label: 'Other' }];

test('a highlighted node is found by id before name, and by name in any case', () => {
  assert.deepEqual(resolveHighlight(['a1'], nodes), ['a1']);
  assert.deepEqual(resolveHighlight(['router'], nodes), ['b2']);
  assert.deepEqual(resolveHighlight(['nas'], nodes), ['nas']);
  assert.deepEqual(resolveHighlight(['NAS'], nodes).sort(), ['a1', 'c3']);
  assert.deepEqual(resolveHighlight(['missing'], nodes), []);
  assert.deepEqual(resolveHighlight(['a1', 'a1', 'Router'], nodes).sort(), ['a1', 'b2']);
});

test('a URL is built from non-default options only, and reads back the same', () => {
  assert.equal(embedQuery({}), '');
  const opts = { angle: 90, zoom: 1.5, toolbar: 'hidden', theme: 'dark', transparent: true, interact: 'always', highlight: ['NAS', 'Home router'] };
  const q = embedQuery(opts);
  assert.deepEqual(parseEmbed(q), { ...DEFAULTS, ...opts });
  assert.equal(embedQuery({ toolbar: 'auto', theme: null, angle: 0 }), '');
});

test('the responsive snippet is a full-width frame plus the one-line script, and the fixed one is a plain iframe', () => {
  const s = embedSnippet({ origin: 'https://s.example', token: 'tok', opts: {} });
  assert.match(s, /^<iframe src="https:\/\/s\.example\/embed\/tok" width="100%" height="500"/);
  assert.match(s, /data-strata-embed/);
  assert.match(s, /<script src="https:\/\/s\.example\/embed\.js" async><\/script>$/);
  const f = embedSnippet({ origin: 'https://s.example', token: 'tok', opts: {}, responsive: false });
  assert.equal(f, '<iframe src="https://s.example/embed/tok" width="800" height="500" style="border:0" allowfullscreen></iframe>');
});

test('options with special characters are escaped inside the snippet', () => {
  const s = embedSnippet({ origin: 'https://s.example', token: 'tok', opts: { highlight: ['A "b" <c>&d'] } });
  assert.ok(!s.includes('"b"'));
  assert.ok(!s.includes('<c>'));
  assert.match(s, /&amp;|%26/);
});
