import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';
import { createApp, EMPTY } from './app.js';

async function withServer(fn, opts) {
  const store = openStore(':memory:');
  const server = createApp(store, opts).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base); } finally { server.closeAllConnections(); server.close(); store.close(); }
}
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const node = { id: 'a', label: 'A', description: '', shape: 'box', color: '#4f8cff', position: [0, 0, 0] };

test('create, save, share, rotate, delete', () => withServer(async (base) => {
  const created = await (await fetch(`${base}/api/diagrams`, json('POST', { name: 'x' }))).json();
  assert.deepEqual(created.data, EMPTY);

  const data = { ...EMPTY, nodes: [node] };
  const saved = await (await fetch(`${base}/api/diagrams/${created.id}`, json('PUT', { name: 'y', data }))).json();
  assert.equal(saved.data.nodes.length, 1);

  const shared = await (await fetch(`${base}/api/shared/${created.viewToken}`)).json();
  assert.equal(shared.name, 'y');
  assert.equal(shared.id, undefined, 'shared payload must not leak the edit id');

  const { viewToken } = await (await fetch(`${base}/api/diagrams/${created.id}/rotate-view-token`, { method: 'POST' })).json();
  assert.notEqual(viewToken, created.viewToken);
  assert.equal((await fetch(`${base}/api/shared/${created.viewToken}`)).status, 404);

  assert.equal((await fetch(`${base}/api/diagrams/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${base}/api/diagrams/${created.id}`)).status, 404);
}));

test('rejects invalid diagrams', () => withServer(async (base) => {
  const bad = { ...EMPTY, connectors: [{ id: 'c', from: 'nope', to: 'a', route: 'straight' }], nodes: [node] };
  const r = await fetch(`${base}/api/diagrams`, json('POST', { name: 'x', data: bad }));
  assert.equal(r.status, 400);
  const svg = { ...EMPTY, nodes: [{ ...node, icon: 'data:image/svg+xml;base64,AAAA' }] };
  assert.equal((await fetch(`${base}/api/diagrams`, json('POST', { name: 'x', data: svg }))).status, 400);
}));

test('without a built UI, / explains where the web app is', () => withServer(async (base) => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /localhost:5173/);
}, { dist: '/definitely/not/here' }));

test('password gate protects the editor but not share links', () => withServer(async (base) => {
  const auth = { authorization: 'Basic ' + Buffer.from('strata:secret').toString('base64') };
  assert.equal((await fetch(`${base}/api/diagrams`)).status, 401);
  assert.equal((await fetch(`${base}/api/diagrams`, { headers: { authorization: 'Basic ' + Buffer.from('strata:nope').toString('base64') } })).status, 401);
  const created = await (await fetch(`${base}/api/diagrams`, { ...json('POST', { name: 'x' }), headers: { 'content-type': 'application/json', ...auth } })).json();
  assert.equal((await fetch(`${base}/api/diagrams/${created.id}`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${base}/api/shared/${created.viewToken}`)).status, 200, 'share links stay public');
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
}, { password: 'secret' }));
