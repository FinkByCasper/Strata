import { create } from 'zustand';
import { EMPTY, freeSpot, newConnector, newNode, newZone } from './model';

// `rev` bumps on every user edit; the editor watches it to drive autosave.
export const useStore = create((set, get) => {
  const edit = (fn) => set((s) => ({ ...fn(s), rev: s.rev + 1 }));
  const patchList = (key, id, patch) => edit((s) => ({
    data: { ...s.data, [key]: s.data[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) },
  }));

  return {
    name: '', data: EMPTY(), readOnly: false, rev: 0,
    selection: null, mode: 'select', connectFrom: null,
    snap: true, dragging: false, hovering: false, view: null,

    load: (name, data, readOnly = false) =>
      set({ name, data, readOnly, rev: 0, selection: null, mode: 'select', connectFrom: null, view: null }),
    replaceData: (name, data) => edit(() => ({ data, name: name ?? get().name, selection: null })),
    setName: (name) => edit(() => ({ name })),

    select: (selection) => set({ selection }),
    setMode: (mode) => set({ mode, connectFrom: null }),
    setSnap: (snap) => set({ snap }),
    setDragging: (dragging) => set({ dragging }),
    setHovering: (hovering) => set({ hovering }),
    setView: (name) => set({ view: { name, nonce: Math.random() } }),

    addNode: (shape) => {
      const { data } = get();
      const node = newNode(shape, freeSpot(data.nodes), data.nodes.length);
      edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, node] }, selection: { type: 'node', id: node.id } }));
    },
    addZone: () => {
      const zone = newZone([0, 1.5, 0]);
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
