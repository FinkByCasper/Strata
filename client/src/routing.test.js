import test from 'node:test';
import assert from 'node:assert/strict';
import { around, forgetRoutes, orthogonalRoute, routeAll, spread } from './routing.js';

test.beforeEach(() => forgetRoutes());

const node = (id, x, z) => ({ id, position: [x, 0, z] });
const link = (id, from, to, route = 'orthogonal') => ({ id, from, to, route });
const blockedOf = (nodes) => new Set(nodes.map((n) => (Math.round(n.position[0]) + 50000) * 100000 + Math.round(n.position[2]) + 50000));
const cellsOf = (poly) => {
  const out = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[i + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let k = 0; k <= n; k++) out.push([Math.round(x0 + ((x1 - x0) * k) / (n || 1)), Math.round(z0 + ((z1 - z0) * k) / (n || 1))]);
  }
  return out;
};
const rightAngled = (poly) => poly.every((p, i) => i === 0 || Math.abs(p[0] - poly[i - 1][0]) < 1e-9 || Math.abs(p[1] - poly[i - 1][1]) < 1e-9);
const touches = (poly, nodes) => cellsOf(poly).some(([x, z]) => nodes.some((n) => n.position[0] === x && n.position[2] === z));

test('with nothing in the way the elbow is exactly what it always was', () => {
  const a = node('a', 0, 0), b = node('b', 6, 4);
  assert.deepEqual(orthogonalRoute(a.position, b.position, 0, blockedOf([a, b])), [[0, 0], [6, 0], [6, 4]]);
  assert.deepEqual(orthogonalRoute(a.position, b.position, 1, blockedOf([a, b])), [[0, 0], [0, 4], [6, 4]]);
});

test('nodes in a straight line give a straight line', () => {
  const a = node('a', 0, 0), b = node('b', 6, 0);
  assert.deepEqual(orthogonalRoute(a.position, b.position, 0, blockedOf([a, b])), [[0, 0], [6, 0]]);
});

test('a node in the way sends the line around it, right-angled, without touching any node', () => {
  const nodes = [node('a', 0, 0), node('mid', 3, 0), node('b', 6, 0)];
  const poly = orthogonalRoute(nodes[0].position, nodes[2].position, 0, blockedOf(nodes));
  assert.ok(rightAngled(poly));
  assert.deepEqual(poly[0], [0, 0]);
  assert.deepEqual(poly.at(-1), [6, 0]);
  assert.ok(poly.length > 2);
  assert.equal(touches(poly, [nodes[1]]), false);
});

test('a wall of nodes is walked around the short way', () => {
  const wall = [-2, -1, 0, 1, 2].map((z) => node(`w${z}`, 3, z));
  const nodes = [node('a', 0, 0), node('b', 6, 0), ...wall];
  const poly = orthogonalRoute(nodes[0].position, nodes[1].position, 0, blockedOf(nodes));
  assert.equal(touches(poly, wall), false);
  assert.ok(rightAngled(poly));
  const length = poly.reduce((s, p, i) => s + (i ? Math.abs(p[0] - poly[i - 1][0]) + Math.abs(p[1] - poly[i - 1][1]) : 0), 0);
  assert.ok(length <= 6 + 2 * 3 + 2, `route is ${length} long`);
});

test('the preferred direction is kept when both ways round are equally good', () => {
  const nodes = [node('a', 0, 0), node('mid', 3, 0), node('b', 6, 0)];
  const first = orthogonalRoute(nodes[0].position, nodes[2].position, 1, blockedOf(nodes));
  assert.equal(first[0][0] === first[1][0], true);
});

test('a node boxed in on every side falls back to the plain elbow instead of failing', () => {
  const ring = [];
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) ring.push(node(`r${x}${z}`, 10 + x, 10 + z));
  const nodes = [node('in', 10, 10), node('out', 0, 0), ...ring];
  const poly = orthogonalRoute(nodes[1].position, nodes[0].position, 0, blockedOf(nodes));
  assert.deepEqual(poly, [[0, 0], [10, 0], [10, 10]]);
});

test('the search is bounded', () => {
  const blocked = new Set();
  for (let x = -200; x <= 200; x++) blocked.add((x + 50000) * 100000 + 3 + 50000);
  assert.equal(around([0, 0], [0, 6], blocked, 0), null);
});

test('lines never run through a node, over many random layouts', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 40; round++) {
    const nodes = Array.from({ length: 25 }, (_, i) => node(`n${i}`, Math.floor(rnd() * 14), Math.floor(rnd() * 14)));
    const unique = nodes.filter((n, i) => nodes.findIndex((o) => o.position[0] === n.position[0] && o.position[2] === n.position[2]) === i);
    const links = [];
    for (let i = 0; i < 20; i++) links.push(link(`c${i}`, unique[Math.floor(rnd() * unique.length)].id, unique[Math.floor(rnd() * unique.length)].id, rnd() < 0.5 ? 'orthogonal' : 'orthogonal-z'));
    const plans = routeAll(unique, links.filter((l) => l.from !== l.to));
    for (const l of links) {
      const plan = plans.get(l.id);
      if (!plan?.poly) continue;
      const others = unique.filter((n) => n.id !== l.from && n.id !== l.to);
      const [x, z] = plan.poly[0];
      const reroutable = true;
      assert.ok(reroutable && rightAngled(plan.poly) || plan.poly.length <= 3, 'right-angled');
      const elbowOnly = plan.poly.length <= 3 && cellsOf(plan.poly).some(([cx, cz]) => others.some((n) => n.position[0] === cx && n.position[2] === cz));
      const boxedIn = elbowOnly;
      if (!boxedIn) assert.equal(touches(plan.poly, others.filter((n) => !(n.position[0] === x && n.position[2] === z))), false);
    }
  }
});

test('two lines between the same nodes become two parallel lines on either side of the middle', () => {
  const nodes = [node('a', 0, 0), node('b', 6, 0)];
  const plans = routeAll(nodes, [link('x', 'a', 'b'), link('y', 'b', 'a')]);
  const one = plans.get('x').poly, two = plans.get('y').poly;
  assert.ok(Math.abs(one[0][1] - two[0][1]) > 0.1);
  assert.ok(Math.abs(one[0][1] + two[0][1]) < 1e-9);
  assert.ok(rightAngled(one) && rightAngled(two));
});

test('a line that shares nothing stays exactly where it was', () => {
  const nodes = [node('a', 0, 0), node('b', 6, 4), node('c', 0, 9)];
  const plans = routeAll(nodes, [link('x', 'a', 'b'), link('y', 'c', 'b')]);
  assert.deepEqual(plans.get('x').poly, [[0, 0], [6, 0], [6, 4]]);
});

test('lines that only meet end to end are not separated', () => {
  const out = spread([[[0, 0], [3, 0]], [[3, 0], [6, 0]]]);
  assert.deepEqual(out, [[[0, 0], [3, 0]], [[3, 0], [6, 0]]]);
});

test('lines that overlap partway are separated where they overlap and keep their corners', () => {
  const out = spread([[[0, 0], [6, 0], [6, 5]], [[3, 0], [9, 0]]]);
  assert.notEqual(out[0][0][1], out[1][0][1]);
  assert.ok(rightAngled(out[0]) && rightAngled(out[1]));
  assert.equal(out[0][1][1], out[0][0][1]);
  assert.equal(out[0][2][0], out[0][1][0]);
});

test('three lines share a corridor in three lanes, evenly spaced', () => {
  const out = spread([[[0, 0], [6, 0]], [[0, 0], [6, 0]], [[0, 0], [6, 0]]]);
  const zs = out.map((p) => p[0][1]).sort((x, y) => x - y);
  assert.ok(Math.abs(zs[1]) < 1e-9);
  assert.ok(Math.abs(zs[1] - zs[0] - (zs[2] - zs[1])) < 1e-9);
  assert.ok(zs[2] - zs[0] <= 0.9 + 1e-9);
});

test('many lines in one corridor stay inside the width of a node', () => {
  const out = spread(Array.from({ length: 12 }, () => [[0, 0], [6, 0]]));
  const zs = out.map((p) => p[0][1]);
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 0.9 + 1e-9);
  assert.equal(new Set(zs.map((z) => z.toFixed(6))).size, 12);
});

test('straight and curved lines between the same nodes are moved sideways, one way and the other', () => {
  const nodes = [node('a', 0, 0), node('b', 6, 0)];
  const plans = routeAll(nodes, [link('s1', 'a', 'b', 'straight'), link('s2', 'b', 'a', 'straight'), link('lone', 'a', 'b', 'curved')]);
  assert.ok(plans.get('s1').shift && plans.get('s2').shift);
  assert.ok(Math.abs(plans.get('s1').shift[1] - plans.get('s2').shift[1]) > 0.1);
  assert.equal(plans.has('lone'), false);
});

test('moving one node only reroutes the lines that pass near it', () => {
  const nodes = [node('a', 0, 0), node('b', 12, 0), node('c', 0, 30), node('d', 12, 30), node('x', 100, 100)];
  const links = [link('top', 'a', 'b'), link('bottom', 'c', 'd')];
  const first = routeAll(nodes, links);
  assert.deepEqual(first.get('top').poly, [[0, 0], [12, 0]]);
  const blocking = [...nodes.filter((n) => n.id !== 'x'), node('x', 6, 0)];
  const second = routeAll(blocking, links);
  assert.ok(second.get('top').poly.length > 2);
  assert.deepEqual(second.get('bottom').poly, first.get('bottom').poly);
  const freed = routeAll(nodes, links);
  assert.deepEqual(freed.get('top').poly, [[0, 0], [12, 0]]);
});

test('a line follows its nodes when they move', () => {
  const links = [link('l', 'a', 'b')];
  assert.deepEqual(routeAll([node('a', 0, 0), node('b', 6, 4)], links).get('l').poly, [[0, 0], [6, 0], [6, 4]]);
  assert.deepEqual(routeAll([node('a', 0, 0), node('b', 9, 4)], links).get('l').poly, [[0, 0], [9, 0], [9, 4]]);
});

function bigDiagram(count, linksPerNode, spacing) {
  const side = Math.ceil(Math.sqrt(count));
  const nodes = Array.from({ length: count }, (_, i) => node(`n${i}`, (i % side) * spacing, Math.floor(i / side) * spacing));
  let seed = 11;
  const rnd = (n) => ((seed = (seed * 16807) % 2147483647) % n);
  const links = [];
  for (let i = 0; i < count * linksPerNode; i++) {
    const from = rnd(count);
    const near = Math.max(0, Math.min(count - 1, from + rnd(2 * side + 1) - side));
    if (near !== from) links.push(link(`c${i}`, `n${from}`, `n${near}`, i % 2 ? 'orthogonal' : 'orthogonal-z'));
  }
  return { nodes, links };
}

test('a big, realistic diagram is routed quickly the first time, and almost instantly after a small change', () => {
  const { nodes, links } = bigDiagram(2000, 1.5, 3);
  let t = performance.now();
  const plans = routeAll(nodes, links);
  const first = performance.now() - t;
  assert.equal(plans.size, links.length);
  assert.ok(first < 3000, `first routing took ${first.toFixed(0)} ms`);
  const moved = nodes.map((n, i) => (i === 7 ? node(n.id, n.position[0] + 1, n.position[2]) : n));
  t = performance.now();
  routeAll(moved, links);
  const again = performance.now() - t;
  assert.ok(again < 600, `a one-node change took ${again.toFixed(0)} ms`);
  console.log(`routing 2000 nodes / ${links.length} lines: first ${first.toFixed(0)} ms, after moving one node ${again.toFixed(0)} ms`);
});
