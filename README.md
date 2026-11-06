# Strata

Build diagrams with depth. Strata is a self-hosted 3D diagram builder, in the spirit of FossFLOW,
but with a **free orthographic camera** instead of a fixed 45° isometric view, and **labels that
always face you** so text stays easy to read from any angle.

One ASP.NET Core process serves the web app and the API. Diagrams are stored in SQLite by default (PostgreSQL and SQL Server are optional), can be exported
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
- **Multi-select**: Shift-click or drag a box (Shift-drag, or the box tool, `B`) to pick several things, then move, copy, paste, delete and recolour them together
- **Your own 3D models**: upload a `.glb` or `.gltf` and use it for a node instead of a built-in shape, with its own size and rotation
- **Real-time editing**: several people can have the same diagram open at once; changes show up live for everyone, with each person's name, colour and cursor
- **Version history**: Strata keeps a copy of the diagram before a save replaces it, you can save named versions, and any version can be restored (the replaced state is kept, so a restore can be undone)
- **Accounts**: sign in with email and password, every diagram has an owner, and an owner can share a diagram with other accounts as viewer or editor

## Run it

You need the **.NET 10 SDK** (the server) and **Node 22 or newer** (builds the web app). `pnpm`, `npm` or `yarn` all work.

**Development** (hot reload):

```bash
pnpm install
pnpm run dev
```

Then open **http://localhost:5173**. That is the web app. Port 3001 is only the API behind it, so it won't show the
app (it shows a short note pointing you to 5173 instead). Tests: `npm test`.

**Run it as one server** (what you'd host):

```bash
pnpm install
pnpm run build      # builds the web app into dist/
pnpm start          # serves the app AND the API on http://localhost:3001
```

or with Docker: `docker build -t strata . && docker run -p 3001:3001 -v strata-data:/data strata`

### Hosting it online

**Accounts are on by default.** The first person to open the site creates the first account; everything after that needs a sign-in. Set `STRATA_ALLOW_SIGNUP=false` to stop anyone else from creating accounts. **Share links (`/v/…`) and embeds (`/embed/…`) never need an account.** Details are under *Access model*.

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
| `STRATA_AUTH` | `on` (default) or `off`. `off` is the old behaviour: no login, everyone who can reach the server can edit |
| `STRATA_ALLOW_SIGNUP` | `true` (default) or `false`. When `false`, only the very first account can be created |
| `STRATA_ADMIN_EMAIL` | Optional. Diagrams made before accounts existed go to the first account created, or to this email if set |
| `STRATA_SESSION_DAYS` | How long a sign-in lasts, default `30` |
| `STRATA_HISTORY_INTERVAL_MINUTES` | At most one automatic version per diagram in this many minutes, default `10`; `0` keeps a version on every save that changed something |
| `STRATA_MODEL_MAX_MB` | Largest uploaded model file, default `25` |
| `STRATA_MODEL_MAX_COUNT` | Models per diagram, default `50` |
| `STRATA_MODEL_DIAGRAM_MAX_MB` | Total size of a diagram's models, default `250` |
| `STRATA_LIVE_SAVE_DELAY_MS` | How long after a live change the server writes the diagram to the database, default `1500`. The last person leaving saves at once |
| `STRATA_HISTORY_MAX` | Automatic versions kept per diagram, default `100`; `0` turns automatic versions off. Versions you name are never removed |

Config (env vars): `PORT` (default 3001), `STRATA_DB` (SQLite file, default `./data/strata.db`), `STRATA_DB_PROVIDER` and `STRATA_DB_CONNECTION` (see below), `STRATA_DIST` (folder with the built web app; found automatically next to the server).

The API is described at `/openapi/v1.json`.

### Choosing a database

SQLite (the local file) is the default and needs no setup. To use PostgreSQL or SQL Server instead, set a provider and a connection string:

```bash
STRATA_DB_PROVIDER=postgres
STRATA_DB_CONNECTION="Host=db;Database=strata;Username=strata;Password=secret"

STRATA_DB_PROVIDER=sqlserver
STRATA_DB_CONNECTION="Server=db,1433;Database=strata;User Id=strata;Password=secret;TrustServerCertificate=True"
```

Tables are created and upgraded on start. The database is created too if the login is allowed to; otherwise create an empty one first. Each engine has its own migration project (`src/Strata.Migrations.*`). To copy diagrams from SQLite into a server database, start Strata once with the new settings and run `import-sqlite` on the old file (below).

To run the tests against an engine, point them at a server that may create databases (each test class makes and drops its own): `STRATA_TEST_PROVIDER=postgres STRATA_TEST_CONNECTION="Host=localhost;Username=postgres;Password=postgres;Database=postgres" npm test`. CI runs all three.

### 3D models

Select a node, choose **Your 3D model** under *Model*, and upload a file. Models are kept next to the diagram in the database (not inside the diagram, which is limited to 4 MB), so every node can refer to one by id, view links and embeds can show them, and the diagram's version history stays small.

- Accepted: glTF 2.0 as `.glb`, or `.gltf` with its data embedded. Models that need Draco, KTX2 or Meshopt decoding are refused with a hint to re-export without compression.
- Checked on upload, not trusted: the file must really be glTF, must not point at any file or URL, images must really be PNG, JPEG or WebP, the structure must be consistent, and there are caps on size, vertex count and number of parts. Uploading the same file twice to one diagram stores it once.
- An unscaled model is fitted so its longest side is one grid cell, whatever unit it was made in, and stands on the floor. *Size* scales that and *Rotation* turns it (degrees).
- A model can only be deleted while neither the diagram nor any saved version uses it, so restoring a version never loses a model.
- The per-diagram **Export JSON** and `GET /api/export` bundle the models they use. Importing uploads them again, with new ids that the nodes are switched to.
- Who may see a model follows the diagram: owner, editor and viewer can read; owner and editor can upload and delete; a view link can read the models of its own diagram.
### Real-time editing

Opening a diagram joins its live room. Changes are sent as small operations on whole entities (a node, a connector, a zone, or the name), not as the whole diagram, so two people changing different things never collide. If two change the same entity, the one the server received last wins, and everyone ends up with the same result. Everyone sees who is there (avatars next to the save status) and where their pointer is on the floor. Viewers watch live too but cannot change anything.

- The server keeps the diagram of an open room in memory and writes it to the database a moment after changes (`STRATA_LIVE_SAVE_DELAY_MS`), and immediately when the last person leaves or the server stops. Authorship and version history keep working because those writes go through the normal save.
- Every operation is checked with the same rules as saving; a batch is applied completely or not at all. Deleting a node removes its connectors for everyone.
- Your own undo only undoes your own changes: edits from others are also applied to your undo history.
- If the connection drops, the page keeps working, shows "Offline, reconnecting…", and sends what you changed when it is back. If live editing cannot be set up at all, the page falls back to the plain autosave it had before.
- Saving through the normal API, restoring a version, or an import that overwrites a diagram replaces the room's copy for everyone and says so; deleting a diagram closes the room; changing someone's role or removing them from a diagram sends them out of the room so they rejoin with their new access.
- Without accounts, people appear as *Guest 1*, *Guest 2*, … in the order they joined. With accounts, as their display name.
- The hub is at `/hubs/diagram` (SignalR). Behind a reverse proxy, WebSockets must be allowed; if they are not, SignalR falls back to long polling.
- A connection keeps the access it had when it joined until it is closed or the access is changed through Strata. Signing out reloads the page and closes it.

### Version history

Every diagram has a history, kept in its own tables (`diagram_versions`) in the configured database, so it moves with the data and is included when you back the database up. The Share &amp; file menu has **Version history…**.

- Before a save replaces the diagram, the server keeps the state being replaced, unless it already kept one within the last `STRATA_HISTORY_INTERVAL_MINUTES`, the content is unchanged, or the diagram is empty. Keeping the state *before* the save is what protects you when you open an old diagram and wipe it by mistake.
- A version shows when its state was saved and by whom, not when the copy was made.
- **Save version** names the diagram as it is now; those are kept until the owner deletes them. Automatic ones beyond `STRATA_HISTORY_MAX` are dropped, oldest first.
- **Restore** keeps what is being replaced as a version first (labelled *Before a restore*), so restoring is itself undoable.
- Viewers can read the history; owners and editors can save and restore; only the owner can delete versions.
- Every version is a full copy, so a diagram near the 4 MB limit with a long history takes real space; lower `STRATA_HISTORY_MAX` for those.

### Backups, and moving over from the Node beta

`GET /api/export` downloads every diagram, with its 3D models, as one JSON file; `POST /api/import` reads that file back (existing ids are skipped, add `?overwrite=true` to replace them). Ids and view tokens are kept, so share links survive.

A `strata.db` written by the Node beta is picked up in place: point `STRATA_DB` at it and start the new server. To copy a beta file into another database instead, run the importer once:

```bash
dotnet run --project src/Strata.Server -- import-sqlite path/to/old/strata.db
docker compose run --rm -v /path/to/old:/old strata import-sqlite /old/strata.db
```

Troubleshooting:
- *"Cannot GET /"* or a blank page: you opened 3001 in dev mode; use 5173, or run `build` then `start`.
- *Server crashes immediately*: check `dotnet --version` is 10 or newer.
- *Port in use*: set `PORT=3002` for the server (the dev proxy expects 3001, so for dev free that port instead).

## Access model

- **Accounts** use an email and a password (10+ characters, stored as a salted hash). A sign-in is a random token in an HTTP-only, same-site cookie; the server keeps only its hash, so signing out really ends it. Ten wrong passwords for an email, or from an address, lock it for 15 minutes. Requests with an `Origin` from another site are refused.
- **Roles per diagram**: the *owner* can do everything, including sharing, regenerating the view link and deleting; an *editor* can open and save; a *viewer* can open it read-only. People see only the diagrams they own or that were shared with them. Anything else answers "not found".
- **View links and embeds** are separate and public: `/api/shared/:token` returns the name and content, never the editing id.
- **Diagrams from before accounts** (the Node beta or `STRATA_AUTH=off`) belong to nobody until an account claims them: the first account created, or `STRATA_ADMIN_EMAIL` if you set it. Set it before the first start if the site is on the internet, so a stranger cannot be first.
- Behind a reverse proxy, Strata trusts `X-Forwarded-For`, `-Proto` and `-Host`, as it expects to be reached through one. Do not publish the container port directly if you rely on the lockout by address.
- Embedding is allowed only on `/embed/*`.
- With `STRATA_AUTH=off` there are no accounts: anyone who can reach the server can list, edit and delete everything, so keep it on a private network or behind your own proxy login.

## Brand

The Strata mark (three stacked isometric layers) lives in `brand/` as SVG and PNG, in light and dark wordmark variants; `public/` holds the favicon and touch icon.

## Layout

```
src/Strata.Server/         ASP.NET Core API, diagram validation, hosting of the web app
src/Strata.Data/           EF Core model
src/Strata.Migrations.*/   EF Core migrations, one project per database engine
tests/Strata.Server.Tests/ xUnit tests (npm test)
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

## Status

Strata is a beta. Known limits today: two people editing the same diagram at
once overwrite each other (last save wins), and PNG export does not include the text labels. Each diagram is limited to 2000 nodes, 4000 connectors, 500 zones and 4 MB.

## License

[MIT](LICENSE), copyright (c) 2026 FinkByCasper.
