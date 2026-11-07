import { placed, pointerCell } from './hold';
import { create } from 'zustand';
import { EMPTY, flatten, freeSpot, newConnector, newNode, newZone, uid } from './model';
import { zoneContents } from './zones.js';
import { clash, nearestFree, swapPlan } from './overlap.js';
import { hasLook, mergeLook, withoutLook } from './connectorStyle.js';
import { attachedToAny, attachedTo, moveTo, newLabel, placeOf, shiftLabels } from './textLabels.js';
import { NOTHING, everything, groupContents, pruned, refsOf, selectionState, toggled } from './selection.js';
import { applyOps, prepare } from './liveOps';
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
    const merge = key != null && key === lastKey && (now - lastAt < COALESCE_MS || s.dragging);   // a whole drag is one step, however slow
    lastKey = key ?? null; lastAt = now;
    const patch = fn(s);
    if ('selection' in patch && !('multi' in patch)) Object.assign(patch, selectionState(patch.selection ? [patch.selection] : []));
    return {
      ...patch, rev: s.rev + 1,
      past: merge ? s.past : [...s.past, { data: s.data, name: s.name }].slice(-MAX_HISTORY),
      future: merge ? s.future : [],
    };
  });
  const patchList = (key, id, patch) => edit((s) => ({
    data: { ...s.data, [key]: s.data[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) },
  }), `${key}:${id}:${Object.keys(patch).join(',')}`);
  // After restoring a snapshot, drop a selection that points at something that no longer exists.
  const restore = (snap, s) => ({ data: snap.data, name: snap.name, ...selectionState(pruned(refsOf(s), snap.data)), connectFrom: null, rev: s.rev + 1 });

  return {
    name: '', data: EMPTY(), readOnly: false, rev: 0,
    selection: null, multi: [], picked: NOTHING, mode: 'select', connectFrom: null,
    toast: null, clip: null, placing: false, snap: true, dragging: false, hovering: false, view: null, menu: null, fresh: null, liftedId: null,
    past: [], future: [],

    load: (name, data, readOnly = false) => { lastKey = null; set({ name, data: flatten(data), readOnly, rev: 0, ...selectionState([]), mode: 'select', connectFrom: null, placing: false, view: null, past: [], future: [] }); },
    // Changes made by other people arrive here: they are not edits of ours (no autosave, no undo step), but the undo history is
    // patched too, so undoing one of our own changes does not bring back what someone else has since changed or deleted.
    applyRemote: (ops) => set((s) => {
      const patch = (snap) => ({ ...snap, data: applyOps(snap.data, ops) });
      const name = ops.findLast((o) => o.op === 'name')?.name ?? s.name;
      const data = applyOps(s.data, ops);
      return { data, name, past: s.past.map(patch), future: s.future.map(patch), ...selectionState(pruned(refsOf(s), data)), connectFrom: s.connectFrom && !data.nodes.some((n) => n.id === s.connectFrom) ? null : s.connectFrom };
    }),
    // The server's copy (already flattened, so the caller can keep sharing its objects) replaces ours: first join, reconnect, or the diagram was restored or saved elsewhere. `keep` are our own
    // changes that the server has not seen yet; they are laid back on top.
    adoptServer: (name, data, keep = [], resetHistory = false) => set((s) => {
      const base = { data, name };
      const ops = prepare(keep);
      const merged = { data: applyOps(base.data, ops), name: ops.findLast((o) => o.op === 'name')?.name ?? name };
      return { ...merged, ...selectionState(pruned(refsOf(s), merged.data)), ...(resetHistory ? { past: [], future: [] } : {}) };
    }),
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

    select: (selection) => set(selectionState(selection ? [selection] : [])),
    selectMany: (refs) => set(selectionState(refs)),
    // Shift-click: add to or take out of the group. Only for editing; the read-only view has no groups.
    toggleSelect: (ref) => { if (!get().readOnly) set(selectionState(toggled(refsOf(get()), ref))); },
    selectAll: () => { if (!get().readOnly) set(selectionState(everything(get().data))); },
    setMode: (mode) => set({ mode, connectFrom: null }),
    setSnap: (snap) => set({ snap }),
    setDragging: (dragging) => { if (dragging) lastKey = null; set({ dragging }); },
    setHovering: (hovering) => set({ hovering }),
    openMenu: (menu) => set({ menu }),
    closeMenu: () => set({ menu: null }),

    // Place a node/zone at an explicit grid position (right-click "Add here").
    addNodeAt: (shape, position) => {
      const [x, z] = nearestFree(get().data.nodes, [position[0], position[2]]);
      const node = newNode(shape, [x, position[1], z], get().data.nodes.length);
      edit((s) => ({ data: { ...s.data, nodes: [...s.data.nodes, node] }, selection: { type: 'node', id: node.id }, fresh: node.id }));
    },
    addLabelAt: (position) => {
      const label = newLabel(uid, position);
      edit((s) => ({ data: { ...s.data, labels: [...s.data.labels, label] }, selection: { type: 'label', id: label.id }, fresh: label.id }));
    },
    updateLabel: (id, patch) => patchList('labels', id, patch),
    // Text can hang on a node or a zone (target {type, id}) or be let go (null); either way it stays where it is on screen.
    attachLabel: (id, target) => edit((s) => ({ data: { ...s.data, labels: s.data.labels.map((l) => (l.id === id ? attachedTo(l, s.data, target) : l)) } })),
    moveLabel: (id, x, z) => edit((s) => ({ data: { ...s.data, labels: s.data.labels.map((l) => (l.id === id ? moveTo(l, s.data, x, z) : l)) } }), `labelmove:${id}`),
    addZoneAt: (position) => {
      const zone = newZone(position);
      edit((s) => ({ data: { ...s.data, zones: [...s.data.zones, zone] }, selection: { type: 'zone', id: zone.id }, fresh: zone.id }));
    },
    // Move everything in a dragged group by the amount the grabbed item moved. `carry` ({nodes, zones} id sets) is fixed when the group is picked up,
    // so it does not scoop up things it passes over.
    moveGroup: (grabbed, x, z, carry) => {
      const { data } = get();
      const item = (grabbed.type === 'zone' ? data.zones : grabbed.type === 'label' ? data.labels : data.nodes).find((q) => q.id === grabbed.id);
      if (!item) return;
      const [cx, cz] = grabbed.type === 'label' ? placeOf(item, data) : [item.position[0], item.position[2]];
      const dx = x - cx, dz = z - cz;
      if (!dx && !dz) return;
      const shift = (o) => ({ ...o, position: [o.position[0] + dx, o.position[1], o.position[2] + dz] });
      edit((s) => ({ data: { ...s.data, nodes: s.data.nodes.map((n) => (carry.nodes.has(n.id) ? shift(n) : n)), zones: s.data.zones.map((q) => (carry.zones.has(q.id) ? shift(q) : q)), labels: shiftLabels(s.data.labels, dx, dz, carry) } }), `groupmove:${grabbed.id}`);
    },
    // What happens when a drag ends. A single node dropped on another trades places with it; anything bigger that would land on a node it did
    // not bring goes back where it was picked up, because there is no sensible way to trade places with a group.
    settleMove: (grabbed, carry, origin, asGroup = false) => {
      const { data } = get();
      if (!carry) {
        const plan = swapPlan(data.nodes, grabbed.id, origin);
        if (!plan) return;
        const other = data.nodes.find((n) => n.id === plan.id), mine = data.nodes.find((n) => n.id === grabbed.id);
        edit((s) => ({ data: { ...s.data, nodes: s.data.nodes.map((n) => (n.id === plan.id ? { ...n, position: plan.position } : n)) } }), `nodes:${grabbed.id}:position`);
        get().showToast(`Swapped ${mine?.label || 'node'} and ${other?.label || 'node'}`);
        return;
      }
      if (!clash(data.nodes, carry.nodes)) return;
      if (grabbed.type === 'zone' && !asGroup) get().moveZone(grabbed.id, origin[0], origin[1], carry);
      else get().moveGroup(grabbed, origin[0], origin[1], carry);
      get().showToast('A node is already there, so it went back');
    },
    // One edit, one undo step, for something every chosen item has in common (a colour, a shape, a line style).
    updateSelected: (patches) => {
      const { picked } = get();
      const apply = (list, ids, patch) => (patch && ids.size ? list.map((x) => (ids.has(x.id) ? { ...x, ...patch } : x)) : list);
      edit((s) => ({ data: { ...s.data, nodes: apply(s.data.nodes, picked.node, patches.node), zones: apply(s.data.zones, picked.zone, patches.zone), connectors: apply(s.data.connectors, picked.connector, patches.connector), labels: apply(s.data.labels, picked.label, patches.label) } }),
        `selected:${Object.entries(patches).map(([k, p]) => `${k}.${Object.keys(p).join(',')}`).join('|')}`);
    },
    // Copy / paste / duplicate for nodes and zones (Ctrl/Cmd+C, Ctrl/Cmd+V, D). A paste lands one square down-right
    // of where the last copy or paste was, so repeated pastes fan out instead of stacking.
    showToast: (msg) => {
      set({ toast: msg });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 2200);
    },
    // Move a zone to (x, z) and carry what is inside it by the same amount (one undo step per drag). `carry` is what to bring
    // ({nodes, zones} id sets); a drag captures it when the zone is picked up so it does not scoop up things it passes over.
    moveZone: (id, x, z, carry = null) => {
      const { data } = get();
      const zone = data.zones.find((q) => q.id === id);
      if (!zone) return;
      const dx = x - zone.position[0], dz = z - zone.position[2];
      if (!dx && !dz) return;
      const c = carry ?? zoneContents(zone, data);
      const shift = (o) => ({ ...o, position: [o.position[0] + dx, o.position[1], o.position[2] + dz] });
      edit((s) => ({
        data: {
          ...s.data,
          zones: s.data.zones.map((q) => (q.id === id ? { ...q, position: [x, q.position[1], z] } : c.zones.has(q.id) ? shift(q) : q)),
          nodes: s.data.nodes.map((n) => (c.nodes.has(n.id) ? shift(n) : n)),
          labels: shiftLabels(s.data.labels, dx, dz, c),
        },
      }), `zonemove:${id}`);
    },
    // Copy / paste / duplicate (Ctrl/Cmd+C, Ctrl/Cmd+V, D). Copying a zone takes everything in it with it. After a copy a
    // ghost follows the mouse (`placing`); the next click, or V, puts the copy there. Duplicate drops it right beside.
    copySelection: (ghost = true) => {
      const clip = buildClip(get().data, refsOf(get()).filter((r) => r.type !== 'connector' || get().multi.length === 0));
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
      if (beside) target = clip.type === 'zone' ? [clip.anchor[0] + clip.main.size[0] + 1, clip.anchor[1]] : clip.type === 'group' ? [clip.anchor[0] + Math.ceil(clip.span[0]) + 2, clip.anchor[1]] : [clip.anchor[0] + 1, clip.anchor[1]];
      else if (pointerCell.over) target = snapAnchor(clip, pointerCell.x, pointerCell.z);
      else { clip.pasted += 1; target = [clip.anchor[0] + clip.pasted, clip.anchor[1] + clip.pasted]; }
      const [dx, dz] = freeOffset(clip, data.nodes, target[0] - clip.anchor[0], target[1] - clip.anchor[1]);
      const made = materialize(clip, dx, dz);
      edit((s) => ({
        data: { ...s.data, nodes: [...s.data.nodes, ...made.nodes], zones: [...s.data.zones, ...made.zones], connectors: [...s.data.connectors, ...made.connectors], labels: [...s.data.labels, ...made.labels] },
        ...selectionState(made.main ? [made.main] : made.all), placing: false,
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
    // The diagram-wide defaults every connector falls back on; one drag of a slider is one undo step.
    setConnectorDefaults: (patch) => edit((s) => ({ data: { ...s.data, style: { ...s.data.style, connector: mergeLook(s.data.style?.connector, patch) } } }), `style:${Object.keys(patch).join(',')}`),
    resetConnectorDefaults: () => edit((s) => ({ data: { ...s.data, style: { ...s.data.style, connector: {} } } })),
    // Takes every connector back to the defaults by removing what was set on each one.
    clearConnectorLooks: () => edit((s) => ({ data: { ...s.data, connectors: s.data.connectors.map((c) => (hasLook(c) ? withoutLook(c) : c)) } })),

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
      const { picked } = get();
      if (!picked.node.size && !picked.zone.size && !picked.connector.size && !picked.label.size) return;
      edit((s) => {
        const d = s.data;
        return {
          ...selectionState([]),
          data: {
            ...d,
            nodes: d.nodes.filter((n) => !picked.node.has(n.id)),
            zones: d.zones.filter((z) => !picked.zone.has(z.id)),
            connectors: d.connectors.filter((c) => !picked.connector.has(c.id) && !picked.node.has(c.from) && !picked.node.has(c.to)),
            labels: d.labels.filter((l) => !picked.label.has(l.id) && !attachedToAny(l, picked.node, picked.zone)),
          },
        };
      });
    },
  };
});
if (typeof window !== 'undefined') window.__strataStore = useStore;   // handy for debugging and tests
