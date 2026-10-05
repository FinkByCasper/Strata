import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useStore } from './store';

// Right-click always opens the "Add" menu (objects are edited via left-click + side panel).
export const openAddMenu = (e, world = null) => {
  const st = useStore.getState();
  if (!st.readOnly) st.openMenu({ x: e.clientX, y: e.clientY, world });
};

export const IconGlyph = ({ icon }) =>
  !icon ? null : icon.startsWith('data:') ? <img src={icon} alt="" className="glyph" /> : <span className="glyph">{icon}</span>;

// drei's Html mounts into `events.connected || canvas.parentNode`. R3F fills in `events.connected` right
// after the first render, so labels that mount first change target, get their React root rebuilt, and are
// never re-rendered (they silently vanish). Passing an explicit, stable portal avoids that.
export function usePortal() {
  const gl = useThree((s) => s.gl);
  return useRef(gl.domElement.parentNode);
}

// Level of detail by zoom (px per world unit): zoomed out, labels shrink to titles, then disappear, so a big
// diagram stays readable and cheap. 'full' > 'title' > 'off'.
export const LOD_FULL = 22, LOD_TITLE = 11;
export const lodFor = (zoom) => (zoom >= LOD_FULL ? 'full' : zoom >= LOD_TITLE ? 'title' : 'off');

// Labels are plain DOM (crisp, selectable, always screen-aligned) positioned from 3D space.
// Wheel events are forwarded so zooming still works while the cursor is over a label.
// Every label registers itself so LabelLayout can nudge overlapping ones apart.
const labelRegistry = new Set();

export function Label({ position, children, className = '', onClick, priority = 2 }) {
  const gl = useThree((s) => s.gl);
  const portal = usePortal();
  const rec = useRef({ el: null, priority, dx: 0, dy: 0 });
  rec.current.priority = priority;
  // drei's Html mounts its children in a separate React root *after* this effect runs, so the element
  // is attached through a callback ref rather than read in the effect.
  const attach = useCallback((node) => { rec.current.el = node; }, []);
  useEffect(() => {
    const r = rec.current;
    labelRegistry.add(r);
    return () => labelRegistry.delete(r);
  }, []);
  return (
    <Html position={position} center zIndexRange={[20, 0]} pointerEvents="none" portal={portal}>
      <div
        ref={attach}
        className={`label ${className}`}
        onPointerDown={(e) => { if (onClick && e.button === 0) { e.stopPropagation(); onClick(e); } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openAddMenu(e); }}
        onWheel={(e) => gl.domElement.dispatchEvent(new WheelEvent('wheel', e.nativeEvent))}
      >
        {children}
      </div>
    </Html>
  );
}

// Greedy screen-space de-overlap. Highest priority keeps its natural spot; the rest move to the nearest free
// slot (above first). A spatial hash keeps the clash test cheap, and the whole pass is skipped while nothing
// on screen has moved.
const GAP = 3, CELL = 80;
let lastSig = '';
export function LabelLayout() {
  useFrame(({ gl }) => {
    const t0 = performance.now();
    const items = [];
    let sig = '';
    for (const r of labelRegistry) {
      if (!r.el?.isConnected) continue;
      const b = r.el.getBoundingClientRect();
      if (b.width > 0) {
        items.push({ r, x: b.left - r.dx, y: b.top - r.dy, w: b.width, h: b.height });
        sig += `${Math.round(b.left - r.dx)},${Math.round(b.top - r.dy)},${Math.round(b.width)};`;
      }
    }
    if (sig !== lastSig) {
      lastSig = sig;
      items.sort((a, b) => b.r.priority - a.r.priority);
      const hash = new Map();
      const keys = (x, y, w, h) => { const out = []; for (let i = Math.floor(x / CELL); i <= Math.floor((x + w) / CELL); i++) for (let j = Math.floor(y / CELL); j <= Math.floor((y + h) / CELL); j++) out.push(`${i},${j}`); return out; };
      const clash = (x, y, w, h) => keys(x - GAP, y - GAP, w + 2 * GAP, h + 2 * GAP).some((k) => hash.get(k)?.some((p) => x < p.x + p.w + GAP && x + w + GAP > p.x && y < p.y + p.h + GAP && y + h + GAP > p.y));
      for (const it of items) {
        const cands = [];
        for (const kx of [0, 1, -1, 2, -2]) for (const k of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
          const dx = kx * (it.w * 0.5 + 6), dy = k * (it.h + 3);
          cands.push({ dx, dy, cost: Math.hypot(dx, dy) + (dy > 0 ? 8 : 0) });
        }
        cands.sort((a, b) => a.cost - b.cost);
        const best = cands.find((c) => !clash(it.x + c.dx, it.y + c.dy, it.w, it.h)) ?? { dx: 0, dy: 0 };
        const rect = { x: it.x + best.dx, y: it.y + best.dy, w: it.w, h: it.h };
        for (const k of keys(rect.x, rect.y, rect.w, rect.h)) (hash.get(k) ?? hash.set(k, []).get(k)).push(rect);
        if (best.dx !== it.r.dx || best.dy !== it.r.dy) {
          it.r.dx = best.dx; it.r.dy = best.dy;
          it.r.el.style.translate = best.dx || best.dy ? `${best.dx}px ${best.dy}px` : '';
        }
      }
    }
    // Cheap perf counters for stress testing (read from the console: window.__strataPerf).
    const perf = (window.__strataPerf ??= { labelMs: 0 });
    perf.labelMs = perf.labelMs * 0.9 + (performance.now() - t0) * 0.1;
    perf.labels = items.length;
    perf.calls = gl.info.render.calls;
    perf.triangles = gl.info.render.triangles;
  });
  return null;
}

// The current level of detail, re-evaluated a few times a second (cheap) rather than every frame.
export function useLod() {
  const [lod, setLod] = useState('full');
  const camera = useThree((s) => s.camera);
  const acc = useRef(1);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const next = lodFor(camera.zoom);
    setLod((cur) => (cur === next ? cur : next));
  });
  return lod;
}
