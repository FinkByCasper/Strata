import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from './store';

// Live camera numbers (written by the scene each frame) so UI outside the canvas, e.g. the tour, can watch them.
export const camState = { azimuth: 0, zoom: 1 };

// The grid square under the mouse while it is over the canvas (null otherwise); paste drops things there.
export const pointerCell = { x: 0, z: 0, over: false };
// When something was last placed from the clipboard (the click that did it must not also clear the selection).
export const placed = { at: -1e9 };

export const UP = new THREE.Vector3(0, 1, 0);
export const GROUND = new THREE.Plane(UP, 0);
const HOLD_MS = 250;   // press and hold this long to pick an object up (a quick click, under this, only selects)
const SLOP = 6;        // px of movement during the hold that cancels it (user meant to orbit/click)

// Hold to lift, drag across the floor, release to drop on that grid cell. A quick click only selects.
export function useHoldMove(getPos, setPos, snapAxis) {
  const [lifted, setLifted] = useState(false);
  const st = useRef(null);

  const finish = useCallback(() => {
    const s = st.current;
    if (!s) return;
    clearTimeout(s.timer);
    st.current = null;
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (s.lifted) {
      setLifted(false);
      useStore.getState().setDragging(false);
      try { s.target.releasePointerCapture?.(s.pid); } catch { /* already released */ }
    }
  }, []);
  useEffect(() => finish, [finish]);

  const start = (e) => {
    finish();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND, hit)) return;
    const [px, , pz] = getPos();
    const s = st.current = {
      x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, dx: hit.x - px, dz: hit.z - pz,
      lifted: false, target: e.target, pid: e.pointerId,
    };
    s.timer = setTimeout(() => {
      s.lifted = true;
      setLifted(true);
      useStore.getState().setDragging(true);
      try { s.target.setPointerCapture(s.pid); } catch { /* pointer already gone */ }
    }, HOLD_MS);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const move = (e) => {
    const s = st.current;
    if (!s) return;
    if (!s.lifted) {
      if (Math.hypot(e.nativeEvent.clientX - s.x, e.nativeEvent.clientY - s.y) > SLOP) finish();
      return;
    }
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND, hit)) return;
    const snap = useStore.getState().snap;
    const q = (v, axis) => (snapAxis ? snapAxis(v, axis, snap) : snap ? Math.round(v) : Math.round(v * 20) / 20);
    const x = q(hit.x - s.dx, 0), z = q(hit.z - s.dz, 2);
    const [cx, , cz] = getPos();
    if (x !== cx || z !== cz) setPos(x, z);
  };

  return { lifted, start, move };
}
if (typeof window !== 'undefined') window.__strataCam = () => ({ az: +camState.azimuth.toFixed(4), zoom: +camState.zoom.toFixed(2) });
