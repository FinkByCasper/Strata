import { pointerCell } from './hold';
import { create } from 'zustand';
import { EMPTY, flatten, freeSpot, newConnector, newNode, newZone, uid } from './model';

// `rev` bumps on every user edit; the editor watches it to drive autosave.
// The nearest grid square to (x, z) that has no node on it.
function nearestFree(nodes, x, z) {
  const taken = new Set(nodes.map((n) => `${n.position[0]},${n.position[2]}`));
  for (let r = 0; r < 30; r++) {
    const ring = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([x + dx, z + dz]);
    ring.sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z) || a[1] - b[1]);
    const free = ring.find(([cx, cz]) => !taken.has(`${cx},${cz}`));
    if (free) return free;
  }
  return [x, z];
}
let toastTimer = 0;
let clip = null;   // the copy/paste buffer
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
    toast: null, snap: true, dragging: false, hovering: false, view: null, menu: null, fresh: null, liftedId: null,
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
    // Copy / paste / duplicate for nodes and zones (Ctrl/Cmd+C, Ctrl/Cmd+V, D). A paste lands one square down-right
    // of where the last copy or paste was, so repeated pastes fan out instead of stacking.
    showToast: (msg) => {
      set({ toast: msg });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 2200);
    },
    copySelection: () => {
      const { selection: sel, data } = get();
      const item = sel?.type === 'node' ? data.nodes.find((x) => x.id === sel.id) : sel?.type === 'zone' ? data.zones.find((x) => x.id === sel.id) : null;
      if (!item) { get().showToast('Select a node or zone first'); return false; }
      clip = { type: sel.type, item: structuredClone(item), pasted: 0 };
      get().showToast(`Copied “${item.label || 'Untitled'}”`);
      return true;
    },
    // Paste lands on the square under the mouse (or one square down-right of the original when the mouse is not over
    // the diagram); duplicate puts the copy right beside the original. A node never lands on an occupied square.
    pasteClipboard: (beside = false) => {
      if (get().readOnly) return;
      if (!clip) { get().showToast('Nothing copied yet: select something and press Ctrl/Cmd+C'); return; }
      const { type, item } = clip;
      const { nodes, zones } = get().data;
      let x, z;
      if (beside) {
        if (type === 'zone') { x = item.position[0] + item.size[0] + 1; z = item.position[2]; }
        else [x, z] = nearestFree(nodes, item.position[0] + 1, item.position[2]);
      } else if (pointerCell.over) {
        x = pointerCell.x; z = pointerCell.z;
        if (type === 'zone') { const off = (n) => (item.size[n] % 2 === 0 ? 0.5 : 0); x = Math.round(x - off(0)) + off(0); z = Math.round(z - off(2)) + off(2); }
        else [x, z] = nearestFree(nodes, x, z);
      } else {
        clip.pasted += 1;
        x = item.position[0] + clip.pasted; z = item.position[2] + clip.pasted;
        if (type === 'node') [x, z] = nearestFree(nodes, x, z);
      }
      const copy = { ...structuredClone(item), id: uid(), position: [x, item.position[1], z] };
      if (type === 'node') edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, copy] }, selection: { type: 'node', id: copy.id } }));
      else edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, copy] }, selection: { type: 'zone', id: copy.id } }));
      get().showToast(`${beside ? 'Duplicated' : 'Pasted'} “${item.label || 'Untitled'}”`);
      void zones;
    },
    duplicateSelection: () => {
      if (get().readOnly) return;
      if (get().copySelection()) get().pasteClipboard(true);
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
