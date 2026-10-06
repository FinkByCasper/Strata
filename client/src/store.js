import { create } from 'zustand';
import { EMPTY, flatten, freeSpot, newConnector, newNode, newZone, uid } from './model';

// `rev` bumps on every user edit; the editor watches it to drive autosave.
export const useStore = create((set, get) => {
  // Undo history is a stack of {data, name} snapshots taken *before* each edit. Rapid edits of the same
  // thing (typing a label, dragging, resizing) share a `key` and collapse into one undo step.
  const MAX_HISTORY = 100, COALESCE_MS = 800;
  let lastKey = null, lastAt = 0;
  const edit = (fn, key) => set((s) => {
    const now = Date.now();
    const merge = key != null && key === lastKey && now - lastAt < COALESCE_MS;
    lastKey = key ?? null; lastAt = now;
    return {
      ...fn(s), rev: s.rev + 1,
      past: merge ? s.past : [...s.past, { data: s.data, name: s.name }].slice(-MAX_HISTORY),
      future: merge ? s.future : [],
    };
  });
  const patchList = (key, id, patch) => edit((s) => ({
    data: { ...s.data, [key]: s.data[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) },
  }), `${key}:${id}:${Object.keys(patch).join(',')}`);
  // After restoring a snapshot, drop a selection that points at something that no longer exists.
  const restore = (snap, s) => {
    const sel = s.selection;
    const list = sel && { node: snap.data.nodes, zone: snap.data.zones, connector: snap.data.connectors }[sel.type];
    return { data: snap.data, name: snap.name, selection: list?.some((x) => x.id === sel.id) ? sel : null, connectFrom: null, rev: s.rev + 1 };
  };

  return {
    name: '', data: EMPTY(), readOnly: false, rev: 0,
    selection: null, mode: 'select', connectFrom: null,
    snap: true, dragging: false, hovering: false, view: null, menu: null, fresh: null, liftedId: null,
    past: [], future: [],

    load: (name, data, readOnly = false) => { lastKey = null; set({ name, data: flatten(data), readOnly, rev: 0, selection: null, mode: 'select', connectFrom: null, view: null, past: [], future: [] }); },
    replaceData: (name, data) => edit(() => ({ data: flatten(data), name: name ?? get().name, selection: null })),
    setName: (name) => edit(() => ({ name }), 'name'),

    undo: () => {
      const { past, future, data, name } = get();
      if (!past.length || get().readOnly) return;
      lastKey = null;
      set((s) => ({ ...restore(past[past.length - 1], s), past: past.slice(0, -1), future: [...future, { data, name }] }));
    },
    redo: () => {
      const { past, future, data, name } = get();
      if (!future.length || get().readOnly) return;
      lastKey = null;
      set((s) => ({ ...restore(future[future.length - 1], s), future: future.slice(0, -1), past: [...past, { data, name }] }));
    },

    select: (selection) => set({ selection }),
    setMode: (mode) => set({ mode, connectFrom: null }),
    setSnap: (snap) => set({ snap }),
    setDragging: (dragging) => set({ dragging }),
    setHovering: (hovering) => set({ hovering }),
    openMenu: (menu) => set({ menu }),
    closeMenu: () => set({ menu: null }),

    // Place a node/zone at an explicit grid position (right-click "Add here").
    addNodeAt: (shape, position) => {
      const node = newNode(shape, position, get().data.nodes.length);
      edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, node] }, selection: { type: 'node', id: node.id }, fresh: node.id }));
    },
    addZoneAt: (position) => {
      const zone = newZone(position);
      edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, zone] }, selection: { type: 'zone', id: zone.id }, fresh: zone.id }));
    },
    duplicateSelection: () => {
      const { selection: sel, data } = get();
      const shift = (p) => [p[0] + 1, p[1], p[2] + 1];
      if (sel?.type === 'node') {
        const n = data.nodes.find((x) => x.id === sel.id);
        if (!n) return;
        const copy = { ...n, id: uid(), position: shift(n.position) };
        edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, copy] }, selection: { type: 'node', id: copy.id } }));
      } else if (sel?.type === 'zone') {
        const z = data.zones.find((x) => x.id === sel.id);
        if (!z) return;
        const copy = { ...z, id: uid(), position: shift(z.position) };
        edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, copy] }, selection: { type: 'zone', id: copy.id } }));
      }
    },
    startConnectFrom: (id) => set({ mode: 'connect', connectFrom: id }),
    setView: (name) => set({ view: { name, nonce: Math.random() } }),

    addNode: (shape) => {
      const { data } = get();
      const node = newNode(shape, freeSpot(data.nodes), data.nodes.length);
      edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, node] }, selection: { type: 'node', id: node.id } }));
    },
    addZone: () => {
      const zone = newZone([0, 0, 0]);
      edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, zone] }, selection: { type: 'zone', id: zone.id } }));
    },
    updateNode: (id, patch) => patchList('nodes', id, patch),
    updateZone: (id, patch) => patchList('zones', id, patch),
    updateConnector: (id, patch) => patchList('connectors', id, patch),

    // Click-to-connect: first click picks the source, second creates the connector.
    connectClick: (nodeId) => {
      const { connectFrom, data } = get();
      if (!connectFrom) return set({ connectFrom: nodeId });
      if (connectFrom === nodeId) return set({ connectFrom: null });
      const dup = data.connectors.some((c) => c.from === connectFrom && c.to === nodeId);
      set({ connectFrom: null });
      if (dup) return;
      const c = newConnector(connectFrom, nodeId);
      edit((s) => ({ data: { ...s.data, connectors: [...s.data.connectors, c] }, selection: { type: 'connector', id: c.id } }));
    },

    removeSelection: () => {
      const { selection: sel } = get();
      if (!sel) return;
      edit((s) => {
        const d = s.data;
        if (sel.type === 'node') {
          return { selection: null, data: {
            ...d, nodes: d.nodes.filter((n) => n.id !== sel.id),
            connectors: d.connectors.filter((c) => c.from !== sel.id && c.to !== sel.id),
          } };
        }
        if (sel.type === 'zone') return { selection: null, data: { ...d, zones: d.zones.filter((z) => z.id !== sel.id) } };
        return { selection: null, data: { ...d, connectors: d.connectors.filter((c) => c.id !== sel.id) } };
      });
    },
  };
});
if (typeof window !== 'undefined') window.__strataStore = useStore;   // handy for debugging and tests
