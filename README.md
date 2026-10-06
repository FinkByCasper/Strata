# Strata

Build diagrams with depth. Strata is a self-hosted 3D diagram builder, in the spirit of FossFLOW,
but with a **free orthographic camera** instead of a fixed 45° isometric view, and **labels that
always face you** so text stays easy to read from any angle.

One Node process serves the web app and the API. Diagrams are stored in SQLite, can be exported
as JSON, and can be shared through a view-only link or an embeddable iframe.

## What works today (prototype)

- Free orthographic orbit / pan / zoom, plus one-click **Front / Top / Side / Free / Fit** views
- **Data-flow blobs**: any connector can show small dots travelling along it in the arrow's direction, in the line's colour; "both ways" adds a second stream in a return colour, in its own lane
- Built for big diagrams: node models are baked into merged geometry and drawn with GPU instancing (draw calls depend on the number of model kinds, not nodes), connector lines are merged, and DOM labels are only created near the screen and simplify as you zoom out
- Connectors carry text like nodes do: a label, a subtitle line (e.g. `TCP 5432 · TLS`), and a markdown description shown when selected, including in view-only links
- Soft cast shadows from a sun that follows the camera, so objects sit on the floor
- Nodes: 3D device models (user, server, router/relay, switch, firewall, access point, antenna tower, PC, laptop, phone, printer, database, cache, cloud, container, hub) plus basic shapes (box, cylinder, sphere, slab). All are recolourable; basic shapes can also carry an emoji icon or your own uploaded PNG/JPEG/WebP/GIF
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y; also buttons in the top bar). Quick edits of the same thing merge into one step
- Keyboard: Ctrl/Cmd+C copies a node or a zone (a zone takes everything inside it, with the connections between those nodes, at the same distances) and shows a ghost that follows the mouse; click, or press V, to place it there (Esc cancels the ghost; a camera drag does not place it). D or Ctrl/Cmd+D duplicates right beside the original, Delete removes, V select, C connect mode, G snap, Q/E rotate, F fit, Esc clears. After naming something press Enter so the keyboard goes back to the diagram.
- Zones: flat, rounded translucent floor areas that nodes sit on (VPCs, clusters, teams); select one to get curved corner grips for resizing. A zone's name is painted on the floor in a darker tint of its colour: along an edge (any of four), centred and scaled to fill the zone, or hidden
- Connectors: orthogonal, straight or curved; arrows, dashed lines, per-connector colours, mid-line labels, right-angle routing in either X-first or Z-first order; they follow nodes as you move them
- Everything lives on a flat grid (no height axis): grid lines are the cell borders, and every node fills exactly one square. Zone edges lie on grid lines too. **Press and hold ~0.25 s** on a node or zone to pick it up, move it, and release to drop it on that grid cell (a zone carries everything inside it; resizing a zone does not move its contents); a quick click just selects. In a share link or embed, clicking a node spotlights it and its connections and lists them in the panel (click one to jump to it). Snap can be toggled
- Node labels can carry a second "subtitle" line (IP, port...). Labels are real DOM text (crisp, upright, constant size) with a small safe-markdown description (`**bold**`, `*italic*`, `` `code` ``, `- lists`) shown when a node is selected
- Autosave to the server, JSON export/import, PNG export of the 3D layer
- **Share** dialog: view-only link (`/v/<token>`), embed snippet (`/embed/<token>`), and "regenerate" to revoke

## Run it

You need **Node 22.13 or newer** (the server uses the built-in `node:sqlite`). `pnpm`, `npm` or `yarn` all work.

**Development** (hot reload):

```bash
pnpm install
pnpm run dev
```

Then open **http://localhost:5173**. That is the web app. Port 3001 is only the API behind it, so it won't show the
app (it shows a short note pointing you to 5173 instead).

**Run it as one server** (what you'd host):

```bash
pnpm install
pnpm run build      # builds the web app into dist/
pnpm start          # serves the app AND the API on http://localhost:3001
```

or with Docker: `docker build -t strata . && docker run -p 3001:3001 -v strata-data:/data strata`

### Hosting it online

**There is no login.** Anyone who can open the URL can edit and delete diagrams, so only expose it where that is fine (a private network, a VPN,
or a reverse proxy that does its own authentication). **Share links (`/v/…`) and embeds (`/embed/…`) are read-only.**

**Coolify**: New resource → Docker Compose → pick this repo (compose file `/docker-compose.yaml`). Put your domain on the `strata` service
(port 3001); Coolify handles HTTPS. The data lives in the `strata-data` volume.

**Plain Docker**:

```bash
docker compose up -d --build   # http://<server>:3001  (port: STRATA_PORT in .env, default 3001)
# with automatic HTTPS (set DOMAIN in .env first; ports 80/443 must be reachable):
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d --build
```

Update with `git pull && docker compose up -d --build` (Coolify: Redeploy). Strata also works over plain `http://`, but some browser features
(clipboard access in the share dialog) need HTTPS, so use a domain when you can.

| Variable | Meaning |
| --- | --- |
| `STRATA_PORT` | Plain Docker only: host port, default `3001` |
| `DOMAIN` | Only for `docker-compose.caddy.yaml` |

Config (env vars): `PORT` (default 3001), `STRATA_DB` (default `./data/strata.db`).

Troubleshooting:
- *"Cannot GET /"* or a blank page: you opened 3001 in dev mode; use 5173, or run `build` then `start`.
- *Server crashes immediately*: check `node -v` is 22.13+.
- *Port in use*: set `PORT=3002` for the server (the dev proxy expects 3001, so for dev free that port instead).

## Access model

There are no accounts. Anyone who can reach the server can list and edit diagrams, so put it behind
your VPN or a reverse proxy with auth if it is exposed. Viewers only ever get the read-only
`/api/shared/:token` endpoint, which never reveals the editing id. Embedding is allowed only on `/embed/*`.

## Brand

The Strata mark (three stacked isometric layers) lives in `brand/` as SVG and PNG, in light and dark wordmark variants; `public/` holds the favicon and touch icon.

## Layout

```
server/                    Express API, SQLite store, diagram validation, tests (npm test)
client/src/                React + react-three-fiber app (Scene.jsx is the 3D part)
client/src/components/ui/  shadcn/ui-style components (Radix primitives + Tailwind), copied in so they can be edited
client/src/index.css       Design tokens: light and dark themes (the `.dark` class on <html>)
client/src/scene.css       Styles for the DOM labels and overlays that sit on the 3D canvas
```

### UI

The interface uses Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com) components (MIT) on [Radix UI](https://www.radix-ui.com), and
[Lucide](https://lucide.dev) icons (ISC), all of which are fine in an open-source project. The theme (Light / Dark / System, remembered in
the browser) is in the sun/moon menu; the 3D scene (background, floor grid, shadows, labels) follows it. To add another component, copy it
into `client/src/components/ui/` and import it with `@/components/ui/<name>`.

## Not done yet

Undo/redo, glTF model upload, collision-aware connector routing, labelled PNG export,
touch-friendly node dragging, multi-select, and auto-layout.
