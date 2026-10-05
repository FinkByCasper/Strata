# Strata

Build diagrams with depth. Strata is a self-hosted 3D diagram builder, in the spirit of FossFLOW,
but with a **free orthographic camera** instead of a fixed 45° isometric view, and **labels that
always face you** so text stays easy to read from any angle.

One Node process serves the web app and the API. Diagrams are stored in SQLite, can be exported
as JSON, and can be shared through a view-only link or an embeddable iframe.

## What works today (prototype)

- Free orthographic orbit / pan / zoom, plus one-click **Front / Top / Side / Free / Fit** views
- Nodes: 3D device models (user, server, router/relay, access point, PC, laptop, phone, database, cache) plus basic shapes (box, cylinder, sphere, slab). All are recolourable; basic shapes can also carry an emoji icon or your own uploaded PNG/JPEG/WebP/GIF
- Zones: flat, rounded translucent floor areas that nodes sit on (VPCs, clusters, teams); select one to get curved corner grips for resizing
- Connectors: orthogonal, straight or curved; arrows, dashed lines, per-connector colours, mid-line labels; they follow nodes as you move them
- Everything lives on a flat grid (no height axis). **Press and hold ~0.5 s** on a node or zone to pick it up, move it, and release to drop it on that grid cell; a quick click just selects. Snap can be toggled
- Labels are real DOM text (crisp, upright, constant size) with a small safe-markdown description (`**bold**`, `*italic*`, `` `code` ``, `- lists`) shown when a node is selected
- Autosave to the server, JSON export/import, PNG export of the 3D layer
- **Share** dialog: view-only link (`/v/<token>`), embed snippet (`/embed/<token>`), and "regenerate" to revoke

## Run it

```bash
npm install
npm run dev        # server on :3001, Vite on :5173 (proxies /api)
```

Production:

```bash
npm run build && npm start     # http://localhost:3001
# or
docker build -t strata . && docker run -p 3001:3001 -v strata-data:/data strata
```

Config (env vars): `PORT` (default 3001), `STRATA_DB` (default `./data/strata.db`).
Requires Node 22.13+ (uses the built-in `node:sqlite`).

## Access model

There are no accounts. Anyone who can reach the server can list and edit diagrams, so put it behind
your VPN or a reverse proxy with auth if it is exposed. Viewers only ever get the read-only
`/api/shared/:token` endpoint, which never reveals the editing id. Embedding is allowed only on `/embed/*`.

## Layout

```
server/   Express API, SQLite store, diagram validation, tests (npm test)
client/   React + react-three-fiber app (Scene.jsx is the 3D part)
```

## Not done yet

Undo/redo, glTF model upload, collision-aware connector routing, labelled PNG export,
touch-friendly node dragging, multi-select, and auto-layout.
