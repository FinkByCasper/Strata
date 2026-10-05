import { create } from 'zustand';
import { EMPTY, flatten, freeSpot, newConnector, newNode, newZone, uid } from './model';

// `rev` bumps on every user edit; the editor watches it to drive autosave.
export const useStore = create((set, get) => {
  const edit = (fn) => set((s) => ({ ...fn(s), rev: s.rev + 1 }));
  const patchList = (key, id, patch) => edit((s) => ({
    data: { ...s.data, [key]: s.data[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) },
  }));

  return {
    name: '', data: EMPTY(), readOnly: false, rev: 0,
    selection: null, mode: 'select', connectFrom: null,
    snap: true, dragging: false, hovering: false, view: null, menu: null,

    load: (name, data, readOnly = false) =>
      set({ name, data: flatten(data), readOnly, rev: 0, selection: null, mode: 'select', connectFrom: null, view: null }),
    replaceData: (name, data) => edit(() => ({ data: flatten(data), name: name ?? get().name, selection: null })),
    setName: (name) => edit(() => ({ name })),

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
      edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, node] }, selection: { type: 'node', id: node.id } }));
    },
    addZoneAt: (position) => {
      const zone = newZone(position);
      edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, zone] }, selection: { type: 'zone', id: zone.id } }));
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
