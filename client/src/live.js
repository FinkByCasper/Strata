import * as signalR from '@microsoft/signalr';
import { create } from 'zustand';
import { useStore } from './store';
import { pointerCell } from './hold';
import { applyToShadow, chunk, diff, keyOf, prepare, sameStyle, snapshot } from './liveOps';
import { flatten, uid } from './model';

// status: off (not started) | connecting | live | offline (reconnecting) | unavailable (could not connect: plain autosave takes over)
export const useLive = create(() => ({ status: 'off', peers: [], you: null, unsent: 0 }));
export const cursors = new Map();

const FLUSH_MS = 60;
const CURSOR_MS = 66;
const RETRY_MS = 15000;

export function startLive(diagramId, { onKicked, onClosed, onReset, onRejected } = {}) {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/diagram')
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 15000])
    .configureLogging(signalR.LogLevel.None)
    .build();

  let stopped = false, canEdit = false, me = null, shadow = null, flushTimer = 0, retryTimer = 0;
  const sent = new Map();
  const protectedKeys = new Map();

  const setLive = (patch) => useLive.setState(patch);
  const unsent = () => (shadow ? diff(shadow, useStore.getState().data, useStore.getState().name).length : 0) + sent.size;
  const refreshUnsent = () => setLive({ unsent: unsent() });

  const dirty = (key) => {
    if (protectedKeys.get(key)) return true;
    if (!shadow) return false;
    if (key === 'name') return useStore.getState().name !== shadow.name;
    if (key === 'style') return !sameStyle(useStore.getState().data.style, shadow.style);
    const [kind, id] = key.split(':');
    const list = { node: 'nodes', connector: 'connectors', zone: 'zones' }[kind];
    const now = useStore.getState().data[list].find((x) => x.id === id);
    return now !== shadow.maps[kind].get(id);
  };

  const adopt = (join, first) => {
    const st = useStore.getState();
    const unconfirmed = [...sent.values()].flatMap((b) => b.ops);
    const keep = shadow ? [...unconfirmed, ...diff(shadow, st.data, st.name)] : [];
    const server = flatten(join.data);
    sent.clear(); protectedKeys.clear();
    st.adoptServer(join.name, server, keep, first);
    shadow = snapshot(server, join.name);
    refreshUnsent();
  };

  const flush = async () => {
    flushTimer = 0;
    if (!canEdit || !shadow || useLive.getState().status !== 'live') return;
    const st = useStore.getState();
    const ops = diff(shadow, st.data, st.name);
    if (!ops.length) { refreshUnsent(); return; }
    applyToShadow(shadow, ops);
    for (const batchOps of chunk(ops)) {
      const batch = uid() + uid();
      const keys = new Set(batchOps.map(keyOf));
      sent.set(batch, { keys, ops: batchOps });
      for (const k of keys) protectedKeys.set(k, (protectedKeys.get(k) ?? 0) + 1);
      try {
        await conn.invoke('Apply', batch, batchOps);
      } catch (e) {
        release(batch);
        onRejected?.(e.message.replace(/^.*HubException: /, ''));
        await rejoin();
        return;
      }
    }
    refreshUnsent();
  };

  const release = (batch) => {
    for (const k of sent.get(batch)?.keys ?? []) {
      const left = (protectedKeys.get(k) ?? 1) - 1;
      if (left <= 0) protectedKeys.delete(k); else protectedKeys.set(k, left);
    }
    sent.delete(batch);
  };

  const schedule = () => { if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS); };

  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.data !== prev.data || s.name !== prev.name) { schedule(); refreshUnsent(); }
  });

  conn.on('Ops', (m) => {
    if (m.from === me?.connectionId) {
      const mine = sent.get(m.batch);
      release(m.batch);
      const extras = mine ? m.ops.filter((o) => !mine.keys.has(keyOf(o))) : m.ops;
      if (extras.length) { const ops = prepare(extras); applyToShadow(shadow, ops); useStore.getState().applyRemote(ops); }
      refreshUnsent();
      return;
    }
    const ops = prepare(m.ops).filter((o) => !dirty(keyOf(o)));
    if (!ops.length) return;
    applyToShadow(shadow, ops);
    useStore.getState().applyRemote(ops);
    refreshUnsent();
  });
  conn.on('Reset', (m) => {
    sent.clear(); protectedKeys.clear();
    const server = flatten(m.data);
    useStore.getState().adoptServer(m.name, server, [], false);
    shadow = snapshot(server, m.name);
    refreshUnsent();
    onReset?.();
  });
  conn.on('PeerJoined', (p) => setLive((s) => ({ peers: [...s.peers.filter((x) => x.connectionId !== p.connectionId), p] })));
  conn.on('PeerLeft', (id) => { cursors.delete(id); setLive((s) => ({ peers: s.peers.filter((p) => p.connectionId !== id) })); });
  conn.on('Cursor', (id, x, z) => { if (x == null || z == null) cursors.delete(id); else cursors.set(id, { x, z }); });
  conn.on('Kicked', () => { stop(); onKicked?.(); });
  conn.on('Closed', () => { stop(); onClosed?.(); });

  const join = async (first) => {
    const result = await conn.invoke('Join', diagramId);
    me = result.you;
    canEdit = result.you.canEdit;
    cursors.clear();
    setLive({ status: 'live', peers: result.peers, you: result.you });
    adopt(result, first);
    schedule();
  };

  const rejoin = async () => {
    try { await join(false); } catch { setLive({ status: 'offline' }); }
  };

  conn.onreconnecting(() => setLive({ status: 'offline' }));
  conn.onreconnected(() => { rejoin(); });
  conn.onclose(() => { if (!stopped) { setLive({ status: 'offline' }); retryTimer = setTimeout(connect, RETRY_MS); } });

  const connect = async (first = false) => {
    if (stopped) return;
    try {
      await conn.start();
      await join(first);
    } catch (e) {
      if (stopped) return;
      setLive({ status: first ? 'unavailable' : 'offline' });
      retryTimer = setTimeout(() => connect(false), RETRY_MS);
    }
  };

  let lastCursor = '';
  const cursorTimer = setInterval(() => {
    if (useLive.getState().status !== 'live') return;
    const next = pointerCell.over ? `${pointerCell.fx.toFixed(2)},${pointerCell.fz.toFixed(2)}` : '';
    if (next === lastCursor) return;
    lastCursor = next;
    conn.invoke('Cursor', next ? pointerCell.fx : null, next ? pointerCell.fz : null).catch(() => {});
  }, CURSOR_MS);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(flushTimer); clearTimeout(retryTimer); clearInterval(cursorTimer);
    unsubscribe();
    cursors.clear();
    conn.stop().catch(() => {});
    setLive({ status: 'off', peers: [], you: null, unsent: 0 });
  }

  setLive({ status: 'connecting', peers: [], you: null, unsent: 0 });
  connect(true);
  return stop;
}
if (typeof window !== 'undefined') window.__strataLive = useLive;   // handy for debugging and tests
