import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
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

export function Label({ position, target = null, children, className = '', onClick, priority = 2 }) {
  const gl = useThree((s) => s.gl);
  const portal = usePortal();
  const rec = useRef({ el: null, priority, dx: 0, dy: 0, w: 0, h: 0, pos: new THREE.Vector3(), ro: null });
  rec.current.priority = priority;
  rec.current.pos.set(position[0], position[1], position[2]);
  rec.current.target = target ? (rec.current.target ?? new THREE.Vector3()).set(target[0], target[1], target[2]) : null;   // what the label belongs to: a line is drawn down to it
  // drei's Html mounts its children in a separate React root *after* this effect runs, so the element
  // is attached through a callback ref rather than read in the effect.
  // Its size is cached by a ResizeObserver so the layout pass never has to read the DOM (which forces a reflow).
  const attach = useCallback((node) => {
    const r = rec.current;
    r.ro?.disconnect(); r.ro = null;
    r.el = node;
    if (node) {
      r.ro = new ResizeObserver(() => { r.w = node.offsetWidth; r.h = node.offsetHeight; });
      r.ro.observe(node);
      r.w = node.offsetWidth; r.h = node.offsetHeight;
    }
  }, []);
  useEffect(() => {
    const r = rec.current;
    labelRegistry.add(r);
    return () => { labelRegistry.delete(r); r.ro?.disconnect(); };
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
        <i className="leader" aria-hidden />
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
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ gl, camera, size }) => {
    const t0 = performance.now();
    const items = [];
    let sig = '';
    for (const r of labelRegistry) {
      if (!r.el?.isConnected || r.w <= 0) continue;
      v.copy(r.pos).project(camera);   // where the label's anchor sits on screen, without touching the DOM
      const x = (v.x * 0.5 + 0.5) * size.width - r.w / 2, y = (-v.y * 0.5 + 0.5) * size.height - r.h / 2;
      if (x > size.width || y > size.height || x + r.w < 0 || y + r.h < 0) continue;
      const it = { r, x, y, w: r.w, h: r.h };
      if (r.target) { v.copy(r.target).project(camera); it.tx = (v.x * 0.5 + 0.5) * size.width; it.ty = (-v.y * 0.5 + 0.5) * size.height; }
      items.push(it);
      sig += `${Math.round(x)},${Math.round(y)},${r.w};`;
    }
    if (sig !== lastSig) {
      lastSig = sig;
      items.sort((a, b) => b.r.priority - a.r.priority);
      const hash = new Map();
      const keys = (x, y, w, h) => { const out = []; for (let i = Math.floor(x / CELL); i <= Math.floor((x + w) / CELL); i++) for (let j = Math.floor(y / CELL); j <= Math.floor((y + h) / CELL); j++) out.push(`${i},${j}`); return out; };
      const clash = (x, y, w, h) => keys(x - GAP, y - GAP, w + 2 * GAP, h + 2 * GAP).some((k) => hash.get(k)?.some((p) => x < p.x + p.w + GAP && x + w + GAP > p.x && y < p.y + p.h + GAP && y + h + GAP > p.y));
      for (const it of items) {
        const cands = [];
        for (const kx of [0, 1, -1]) for (const k of [0, -1, 1, -2, 2]) {
          const dx = kx * (it.w * 0.5 + 6), dy = k * (it.h + 3);
          cands.push({ dx, dy, cost: Math.hypot(dx, dy) + (dy > 0 ? 8 : 0) });
        }
        cands.sort((a, b) => a.cost - b.cost);
        // No free spot nearby: a lower-priority label gives way (hidden, like map labels) instead of floating off
        // far from its object. Selected things always stay.
        const free = cands.find((c) => !clash(it.x + c.dx, it.y + c.dy, it.w, it.h));
        const hide = !free && it.r.priority < 3;
        if (hide !== !!it.r.hidden) { it.r.hidden = hide; it.r.el.style.visibility = hide ? 'hidden' : ''; }
        if (hide) continue;
        const best = free ?? { dx: 0, dy: 0 };
        const rect = { x: it.x + best.dx, y: it.y + best.dy, w: it.w, h: it.h };
        for (const k of keys(rect.x, rect.y, rect.w, rect.h)) (hash.get(k) ?? hash.set(k, []).get(k)).push(rect);
        if (best.dx !== it.r.dx || best.dy !== it.r.dy) {
          it.r.dx = best.dx; it.r.dy = best.dy;
          it.r.el.style.translate = best.dx || best.dy ? `${best.dx}px ${best.dy}px` : '';
        }
        // A thin line from the label down to the thing it belongs to (labels sit half a height above their anchor).
        const lead = (it.r.leader ??= it.r.el.querySelector(':scope > .leader'));
        if (lead) {
          const cx = it.x + it.w / 2 + best.dx, cy = it.y + it.h / 2 + best.dy - it.h / 2;   // the label's centre on screen
          const vx = (it.tx ?? it.x + it.w / 2) - cx, vy = (it.ty ?? it.y + it.h / 2) - cy;
          const len = Math.hypot(vx, vy);
          const css = len < 10 ? 'none' : `${len.toFixed(1)}|${Math.atan2(vy, vx).toFixed(3)}`;
          if (css !== it.r.leaderCss) {
            it.r.leaderCss = css;
            if (css === 'none') lead.style.display = 'none';
            else { lead.style.display = 'block'; lead.style.width = `${len}px`; lead.style.transform = `rotate(${Math.atan2(vy, vx)}rad)`; }
          }
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
