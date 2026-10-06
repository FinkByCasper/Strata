import { placed, pointerCell } from './hold';
import { create } from 'zustand';
import { EMPTY, flatten, freeSpot, newConnector, newNode, newZone, uid } from './model';
import { buildClip, describe, freeOffset, materialize, snapAnchor } from './clipboard';

// `rev` bumps on every user edit; the editor watches it to drive autosave.
let toastTimer = 0;
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
    toast: null, clip: null, placing: false, snap: true, dragging: false, hovering: false, view: null, menu: null, fresh: null, liftedId: null,
    past: [], future: [],

    load: (name, data, readOnly = false) => { lastKey = null; set({ name, data: flatten(data), readOnly, rev: 0, selection: null, mode: 'select', connectFrom: null, placing: false, view: null, past: [], future: [] }); },
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
    // Copy / paste / duplicate (Ctrl/Cmd+C, Ctrl/Cmd+V, D). Copying a zone takes everything in it with it. After a copy a
    // ghost follows the mouse (`placing`); the next click, or V, puts the copy there. Duplicate drops it right beside.
    copySelection: (ghost = true) => {
      const clip = buildClip(get().data, get().selection);
      if (!clip) { get().showToast('Select a node or zone first'); return false; }
      set({ clip, placing: ghost && !get().readOnly });
      get().showToast(ghost ? `Copied ${describe(clip)}: click to place it (or press V), Esc to cancel` : `Copied ${describe(clip)}`);
      return true;
    },
    cancelPlacing: () => set({ placing: false }),
    pasteClipboard: (beside = false) => {
      const { clip, data } = get();
      if (get().readOnly) return;
      if (!clip) { get().showToast('Nothing copied yet: select something and press Ctrl/Cmd+C'); return; }
      let target;   // where the anchor should land
      if (beside) target = clip.type === 'zone' ? [clip.anchor[0] + clip.main.size[0] + 1, clip.anchor[1]] : [clip.anchor[0] + 1, clip.anchor[1]];
      else if (pointerCell.over) target = snapAnchor(clip, pointerCell.x, pointerCell.z);
      else { clip.pasted += 1; target = [clip.anchor[0] + clip.pasted, clip.anchor[1] + clip.pasted]; }
      const [dx, dz] = freeOffset(clip, data.nodes, target[0] - clip.anchor[0], target[1] - clip.anchor[1]);
      const made = materialize(clip, dx, dz);
      edit((s) => ({
        data: { ...s.data, nodes: [...s.data.nodes, ...made.nodes], zones: [...s.data.zones, ...made.zones], connectors: [...s.data.connectors, ...made.connectors] },
        selection: made.main, placing: false,
      }));
      placed.at = performance.now();
      get().showToast(`${beside ? 'Duplicated' : 'Pasted'} ${describe(clip)}`);
    },
    duplicateSelection: () => {
      if (get().readOnly) return;
      if (get().copySelection(false)) get().pasteClipboard(true);
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
