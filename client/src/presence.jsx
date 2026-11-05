import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { cursors, useLive } from './live';
import { usePortal } from './labels';
import { Hint } from '@/components/ui/tooltip';

const initial = (name) => (name.trim()[0] ?? '?').toUpperCase();

export function Presence() {
  const peers = useLive((s) => s.peers);
  if (!peers.length) return null;
  const shown = peers.slice(0, 4);
  return (
    <div className="flex items-center -space-x-1.5 max-sm:hidden" role="group" aria-label="People here now">
      {shown.map((p) => (
        <Hint key={p.connectionId} label={p.canEdit ? p.name : `${p.name} (viewing)`}>
          <span className="grid size-6 place-items-center rounded-full border-2 border-card text-[10px] font-semibold text-white" style={{ background: p.color }}>{initial(p.name)}</span>
        </Hint>
      ))}
      {peers.length > shown.length && <span className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">+{peers.length - shown.length}</span>}
    </div>
  );
}

function RemoteCursor({ peer }) {
  const group = useRef();
  const tag = useRef();
  const placed = useRef(false);
  const portal = usePortal();

  useFrame(() => {
    const target = cursors.get(peer.connectionId);
    const g = group.current;
    if (!g || !tag.current) return;
    tag.current.style.display = target ? 'block' : 'none';
    if (!target) { placed.current = false; return; }
    if (!placed.current) { g.position.set(target.x, 0.05, target.z); placed.current = true; return; }
    g.position.x += (target.x - g.position.x) * 0.35;
    g.position.z += (target.z - g.position.z) * 0.35;
  });

  return (
    <group ref={group}>
      <Html zIndexRange={[30, 20]} className="passthrough" portal={portal} style={{ pointerEvents: 'none' }}>
        <div ref={tag} style={{ display: 'none', transform: 'translate(-3px, -3px)', pointerEvents: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 1l12 6.5-5.2 1.4L6.8 14z" fill={peer.color} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          <span style={{ background: peer.color }} className="ml-3.5 -mt-1 block w-max max-w-40 truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow">{peer.name}</span>
        </div>
      </Html>
    </group>
  );
}

export function RemoteCursors() {
  const peers = useLive((s) => s.peers);
  return peers.map((p) => <RemoteCursor key={p.connectionId} peer={p} />);
}
