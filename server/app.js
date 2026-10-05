import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDiagram } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
export const EMPTY = { nodes: [], connectors: [], zones: [] };

export function createApp(store, { dist = process.env.STRATA_DIST || join(here, '..', 'dist') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4mb' }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  // Editor API: anyone with server access can list/edit. Access control is left to the
  // deployment (reverse proxy / network); sharing with others is via the view token.
  app.get('/api/diagrams', (_req, res) => res.json(store.list()));

  app.post('/api/diagrams', wrap((req, res) => {
    const { name = 'Untitled diagram', data = EMPTY } = req.body ?? {};
    const err = validateDiagram(data);
    if (err || typeof name !== 'string' || name.length > 200) return res.status(400).json({ error: err ?? 'bad name' });
    res.status(201).json(store.create(name, data));
  }));

  app.get('/api/diagrams/:id', (req, res) => {
    const d = store.get(req.params.id);
    d ? res.json(d) : res.status(404).json({ error: 'not found' });
  });

  app.put('/api/diagrams/:id', (req, res) => {
    const { name, data } = req.body ?? {};
    const err = validateDiagram(data);
    if (err || typeof name !== 'string' || name.length > 200) return res.status(400).json({ error: err ?? 'bad name' });
    const d = store.save(req.params.id, name, data);
    d ? res.json(d) : res.status(404).json({ error: 'not found' });
  });

  app.post('/api/diagrams/:id/rotate-view-token', (req, res) => {
    const t = store.rotateToken(req.params.id);
    t ? res.json({ viewToken: t }) : res.status(404).json({ error: 'not found' });
  });

  app.delete('/api/diagrams/:id', (req, res) =>
    store.remove(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'not found' }));

  // Public read-only endpoint: exposes name + data only, never the edit id.
  app.get('/api/shared/:token', (req, res) => {
    const d = store.getByToken(req.params.token);
    d ? res.json({ name: d.name, data: d.data, updatedAt: d.updatedAt }) : res.status(404).json({ error: 'not found' });
  });

  if (existsSync(dist)) {
    app.use(express.static(dist));
    // Allow embedding only on the dedicated embed route.
    app.get('*splat', (req, res) => {
      if (!req.path.startsWith('/embed/')) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.sendFile(join(dist, 'index.html'));
    });
  }

  else {
    // No built web app next to the server (normal during `dev`): explain where the UI lives instead of "Cannot GET /".
    app.get('/', (_req, res) => res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"><title>Strata API</title>
<body style="font:16px system-ui;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5">
<h2>Strata API is running</h2>
<p>This port only serves the API. In development, open the web app at
<a href="http://localhost:5173">http://localhost:5173</a>.</p>
<p>To run it all from this one port, build the web app first: <code>pnpm build</code> then <code>pnpm start</code>.</p></body>`));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'internal error' });
  });
  return app;
}
