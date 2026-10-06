# Roadmap

Strata is in **beta**: the core works and is in daily use, but some things you would expect from a finished product are not here yet.
This page is where the project is heading. It is a plan, not a promise, and there are no dates. Order within a section is rough priority.

Want something moved up, or something added? Open an issue and say what you are trying to do.

## Where it stands (beta)

- Free orthographic 3D camera at a locked tilt: rotate in quarter turns, zoom to the cursor, fit, reset. Labels are real text that always faces you.
- Nodes (basic shapes and 16 device models, colours, icons, your own icon upload), zones (flat regions that carry what is inside them), and connectors
  (right-angle, straight or curved; arrowheads on either end; solid or dashed; descriptions; animated data flow in one or both directions).
- Grid-based editing: right-click to add, press-and-hold to pick up and move, copy and paste with a placement ghost, duplicate, undo and redo.
- Autosave to SQLite, JSON export and import, PNG export of the 3D layer.
- View-only share links and iframe embeds, with a spotlight on a node's connections or a zone's contents.
- Light and dark themes, first-run tour, Docker / Docker Compose / Coolify deployment.

## Next: from beta to 1.0

These are the gaps that matter most for using Strata with other people.

- **Access control.** Today anyone who can open the editor can edit and delete. Add real accounts or a login so a deployment can be private, with diagrams owned per user.
- **Safe saving.** Warn when a diagram was changed somewhere else (two tabs, two people) instead of the last save silently winning. Version history with restore.
- **Backups.** Documented backup and restore for the database volume, plus "export everything" as a single download.
- **Labelled export.** PNG (and SVG) export that includes the labels, not only the 3D layer.
- **Touch and small screens.** Pinch to zoom, touch-friendly picking up and dragging, and an editing layout that works on a tablet.
- **Selecting more than one thing.** Multi-select and box select, with group move, copy and delete.
- **Smarter connector routing.** Lines that route around nodes instead of through them, and manual waypoints.
- **Diagram library.** Search, rename, duplicate, folders or tags on the home page.

## Later

Ideas that are wanted but not yet scheduled.

- **Custom 3D models** (glTF upload) alongside the built-in shapes and your own icons.
- **Auto-layout** for imported or large graphs.
- **Importers** for other tools and formats (for example Mermaid, draw.io, FossFLOW, Terraform graphs).
- **Embed options**: start camera angle, hide the toolbar, highlight a chosen node.
- **Comments** on shared views.
- **Real-time collaboration** (multiple editors in one diagram).
- **A published container image** so a deployment does not need to build from source.
- **More themes and palettes**, and translations.
- **More performance headroom** for very large diagrams (thousands of nodes) on modest hardware.

## Known limits today

- The editor has no login (see above). Share links and embeds are read-only.
- Limits per diagram: 2000 nodes, 4000 connectors, 500 zones, 4 MB.
- Two people editing the same diagram at once will overwrite each other.
- PNG export does not include the text labels.
- Plain `http://` works, but some browser features (such as clipboard access in the share dialog) need HTTPS, so use a domain when you can.
