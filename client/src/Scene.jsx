import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { polylineMidpoint, routePoints } from './model';
import { RichText } from './richtext';
import { LABEL_Y, Model, isModel } from './Models';

const UP = new THREE.Vector3(0, 1, 0);

// Right-click always opens the "Add" menu (objects are edited via left-click + side panel).
const openAddMenu = (e, world = null) => {
  const st = useStore.getState();
  if (!st.readOnly) st.openMenu({ x: e.clientX, y: e.clientY, world });
};

function ContextHandler() {
  const { gl, camera } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let down = null;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(UP, 0);
    const onDown = (e) => { if (e.button === 2) down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (e.button !== 2 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5; // right-drag = pan, not a click
      down = null;
      if (moved) return;
      const { clientX, clientY } = e;
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = new THREE.Vector3();
        let world = null;
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const q = useStore.getState().snap ? Math.round : (v) => Math.round(v * 20) / 20;
          world = [q(hit.x), 0, q(hit.z)];
        }
        openAddMenu({ clientX, clientY }, world);
      }, 0);
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('contextmenu', noMenu);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('contextmenu', noMenu); };
  }, [gl, camera]);
  return null;
}

// Labels are plain DOM (crisp, selectable, always screen-aligned) positioned from 3D space.
// Wheel events are forwarded so zooming still works while the cursor is over a label.
// Every label registers itself so LabelLayout can nudge overlapping ones apart each frame.
const labelRegistry = new Set();

// drei's Html mounts into `events.connected || canvas.parentNode`. R3F fills in `events.connected` right
// after the first render, so labels that mount first change target, get their React root rebuilt, and are
// never re-rendered (they silently vanish). Passing an explicit, stable portal avoids that.
function usePortal() {
  const gl = useThree((s) => s.gl);
  return useRef(gl.domElement.parentNode);
}

function Label({ position, children, className = '', onClick, priority = 2 }) {
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

// Greedy screen-space de-overlap. Highest priority keeps its natural spot; the rest move to the
// nearest free slot (up/down first, then sideways). Offsets are applied with CSS `translate`, so they
// compose with each label's own transform, and the natural rect is recovered by subtracting them.
const LABEL_GAP = 3;
function LabelLayout() {
  useFrame(() => {
    const items = [];
    for (const r of labelRegistry) {
      if (!r.el?.isConnected) continue;
      const b = r.el.getBoundingClientRect();
      if (b.width > 0) items.push({ r, x: b.left - r.dx, y: b.top - r.dy, w: b.width, h: b.height });
    }
    items.sort((a, b) => b.r.priority - a.r.priority);
    const placed = [];
    const clash = (x, y, w, h) => placed.some((p) =>
      x < p.x + p.w + LABEL_GAP && x + w + LABEL_GAP > p.x && y < p.y + p.h + LABEL_GAP && y + h + LABEL_GAP > p.y);
    for (const it of items) {
      // Try every nearby slot and take the closest free one; moving up (above the node) is preferred over
      // moving down (which would cover the node's body).
      const cands = [];
      for (const kx of [0, 1, -1, 2, -2]) {
        for (const k of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
          const dx = kx * (it.w * 0.5 + 6), dy = k * (it.h + 3);
          cands.push({ dx, dy, cost: Math.hypot(dx, dy) + (dy > 0 ? 8 : 0) });
        }
      }
      cands.sort((a, b) => a.cost - b.cost);
      let best = cands.find((c) => !clash(it.x + c.dx, it.y + c.dy, it.w, it.h)) ?? null;
      best ??= { dx: 0, dy: 0 };
      placed.push({ x: it.x + best.dx, y: it.y + best.dy, w: it.w, h: it.h });
      if (best.dx !== it.r.dx || best.dy !== it.r.dy) {
        it.r.dx = best.dx; it.r.dy = best.dy;
        it.r.el.style.translate = best.dx || best.dy ? `${best.dx}px ${best.dy}px` : '';
      }
    }
  });
  return null;
}

const IconGlyph = ({ icon }) =>
  !icon ? null : icon.startsWith('data:') ? <img src={icon} alt="" className="glyph" /> : <span className="glyph">{icon}</span>;

function NodeShape({ shape }) {
  switch (shape) {
    case 'cylinder': return <cylinderGeometry args={[0.55, 0.55, 1, 32]} />;
    case 'sphere': return <sphereGeometry args={[0.6, 32, 24]} />;
    case 'slab': return <boxGeometry args={[1.8, 0.25, 1.8]} />;
    default: return <boxGeometry args={[1, 1, 1]} />;
  }
}

// Marks every mesh under a ref as a shadow caster/receiver (except parts flagged userData.noShadow).
function useShadowFlags(ref) {
  useEffect(() => {
    ref.current?.traverse((o) => {
      if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; }
    });
  });
}

const MODEL_SCALE = 1.5;
const HOLD_MS = 500;   // press and hold this long to pick an object up
const SLOP = 6;        // px of movement during the hold that cancels it (user meant to orbit/click)
const GROUND = new THREE.Plane(UP, 0);

// Hold to lift, drag across the floor, release to drop on that grid cell. A quick click only selects.
function useHoldMove(getPos, setPos, snapAxis) {
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

function NodeView({ node }) {
  const portal = usePortal();
  const selected = useStore((s) => s.selection?.type === 'node' && s.selection.id === node.id);
  const connecting = useStore((s) => s.connectFrom === node.id);
  const yOffset = node.shape === 'slab' ? -0.375 : 0;
  const hold = useHoldMove(
    () => node.position,
    (x, z) => useStore.getState().updateNode(node.id, { position: [x, 0, z] }),
  );

  // Shared by the mesh and its label: connect-mode click, or plain selection.
  const pick = () => {
    const s = useStore.getState();
    if (s.mode === 'connect' && !s.readOnly) { s.connectClick(node.id); return false; }
    s.select({ type: 'node', id: node.id });
    return !s.readOnly;
  };

  const onDown = (e) => {
    e.stopPropagation();
    if (e.nativeEvent.button !== 0) return;
    if (pick()) hold.start(e);
  };

  const hover = (on) => () => {
    const s = useStore.getState();
    // Orbit must already be off by pointer-down (OrbitControls reads it first), so key off hover.
    if (!s.readOnly) s.setHovering(on);
    document.body.style.cursor = on ? (s.mode === 'connect' ? 'crosshair' : s.readOnly ? 'pointer' : 'pointer') : '';
  };

  const basic = !isModel(node.shape);
  const glow = selected || connecting;
  const labelY = (LABEL_Y[node.shape] ?? 1.05) * (basic ? 1 : MODEL_SCALE);
  const body = useRef();
  useShadowFlags(body);

  // Handlers sit on the group so they fire for every part of a multi-mesh device model.
  return (
    <group position={node.position}>
      {hold.lifted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.47, 0]} raycast={() => null}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial color={node.color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      {glow && !hold.lifted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.47, 0]} raycast={() => null}>
          <ringGeometry args={[0.62, 0.72, 40]} />
          <meshBasicMaterial color={connecting ? '#f5a524' : '#4f8cff'} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <group position={[0, hold.lifted ? 0.5 : 0, 0]}>
        <group
          ref={body} scale={(hold.lifted ? 1.1 : 1) * (basic ? 1 : MODEL_SCALE)}
          onPointerDown={onDown} onPointerMove={hold.move}
          onPointerOver={hover(true)} onPointerOut={hover(false)}
        >
          {basic ? (
            <mesh position={[0, yOffset, 0]} scale={selected ? 1.05 : 1}>
              <NodeShape shape={node.shape} />
              <meshStandardMaterial
                color={node.color} roughness={0.55} metalness={0.05}
                emissive={glow ? node.color : '#000'} emissiveIntensity={connecting ? 0.7 : 0.3}
              />
              {glow && <Edges color="#111827" />}
            </mesh>
          ) : (
            <Model kind={node.shape} color={node.color} glow={glow} />
          )}
        </group>
        {node.icon && basic && node.shape !== 'slab' && (
          <Html center position={[0, 0, 0]} zIndexRange={[10, 0]} className="passthrough" portal={portal}>
            <div className={`onshape ${/^[\w ]{2,}$/.test(node.icon) ? 'text' : ''}`}><IconGlyph icon={node.icon} /></div>
          </Html>
        )}
        <Label
          position={[0, labelY, 0]}
          className={selected ? 'selected' : ''} priority={selected ? 3 : 2}
          onClick={pick}
        >
          <div className="title">
            {node.icon && (!basic || node.shape === 'slab') && <IconGlyph icon={node.icon} />}
            {node.label || <em>Untitled</em>}
          </div>
          {node.subtitle && <div className="sub">{node.subtitle}</div>}
          {selected && node.description && <RichText text={node.description} />}
        </Label>
      </group>
    </group>
  );
}

function ConnectorView({ connector, from, to }) {
  const selected = useStore((s) => s.selection?.type === 'connector' && s.selection.id === connector.id);
  const points = useMemo(() => routePoints(from.position, to.position, connector.route),
    [from.position, to.position, connector.route]);
  const color = connector.color || '#475569';
  const end = points[points.length - 1];
  const dir = end.clone().sub(points[points.length - 2]).normalize();
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir), [dir.x, dir.y, dir.z]);
  const select = (e) => { e.stopPropagation(); useStore.getState().select({ type: 'connector', id: connector.id }); };

  return (
    <group>
      {selected && <Line points={points} color="#4f8cff" lineWidth={7} transparent opacity={0.35} raycast={() => null} />}
      <Line
        points={points} color={color} lineWidth={selected ? 3.6 : 2.4}
        dashed={connector.line === 'dashed'} dashSize={0.25} gapSize={0.18}
        onClick={select}
      />
      {connector.arrow && (
        <mesh position={end.clone().addScaledVector(dir, -0.17)} quaternion={quat} onClick={select}>
          <coneGeometry args={[selected ? 0.16 : 0.13, selected ? 0.4 : 0.34, 14]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {connector.label && (
        <Label position={polylineMidpoint(points)} className="line-label" onClick={select} priority={1.5}>
          {connector.label}
        </Label>
      )}
    </group>
  );
}

// Zones are rounded rectangles lying on the floor.
const cornerRadius = (w, d) => Math.min(0.8, w / 2, d / 2);
function roundedRect(w, d, r) {
  const x = -w / 2, y = -d / 2, s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + d - r);
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d);
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Corner handle: drag to resize a zone with the opposite corner pinned. Corners snap to cell borders.
function ZoneHandle({ zone, corner: [sx, sz], onHover }) {
  const drag = useRef(null);
  const [w, , d] = zone.size;

  const down = (e) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.select({ type: 'zone', id: zone.id });
    drag.current = { ax: zone.position[0] - (sx * w) / 2, az: zone.position[2] - (sz * d) / 2 };
    st.setDragging(true);
    try { e.target.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };
  const move = (e) => {
    const a = drag.current;
    if (!a) return;
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND, hit)) return;
    const snap = useStore.getState().snap;
    const edge = (v) => (snap ? Math.round(v - 0.5) + 0.5 : Math.round(v * 20) / 20);
    const nx = a.ax + sx * Math.max(1, sx * (edge(hit.x) - a.ax));
    const nz = a.az + sz * Math.max(1, sz * (edge(hit.z) - a.az));
    useStore.getState().updateZone(zone.id, {
      position: [(nx + a.ax) / 2, 0, (nz + a.az) / 2], size: [Math.abs(nx - a.ax), 0, Math.abs(nz - a.az)],
    });
  };
  const up = (e) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.target.releasePointerCapture?.(e.pointerId); } catch { /* released */ }
    useStore.getState().setDragging(false);
  };
  const over = (on) => () => { useStore.getState().setHovering(on); onHover(on); document.body.style.cursor = on ? 'move' : ''; };

  // A quarter-ring that sits on the zone's rounded corner (floor-flat, inside the outline).
  const r = cornerRadius(w, d);
  const dirAngle = Math.atan2(-sz, sx); // shape-space y is -z once the group is laid flat
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <mesh
        position={[sx * (w / 2 - r), -sz * (d / 2 - r), 0]} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onLostPointerCapture={up} onPointerOver={over(true)} onPointerOut={over(false)}
      >
        <ringGeometry args={[r - 0.36, r, 20, 1, dirAngle - Math.PI / 4, Math.PI / 2]} />
        <meshBasicMaterial color={zone.color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function ZoneView({ zone }) {
  const selected = useStore((s) => s.selection?.type === 'zone' && s.selection.id === zone.id);
  const editable = useStore((s) => !s.readOnly && s.mode === 'select');
  const [hovered, setHovered] = useState(false);
  const [w, , d] = zone.size;
  // Even-sized zones centre on a cell border, odd-sized ones on a cell centre, so edges stay on borders.
  const snapAxis = (v, axis, snap) => {
    if (!snap) return Math.round(v * 20) / 20;
    const off = zone.size[axis] % 2 === 0 ? 0.5 : 0;
    return Math.round(v - off) + off;
  };
  const hold = useHoldMove(
    () => zone.position,
    (x, z) => useStore.getState().updateZone(zone.id, { position: [x, 0, z] }),
    snapAxis,
  );
  const shape = useMemo(() => roundedRect(w, d, cornerRadius(w, d)), [w, d]);
  const outline = useMemo(() => {
    const pts = shape.getPoints(10).map((p) => [p.x, 0, p.y]);
    return [...pts, pts[0]];
  }, [shape]);

  const onDown = (e) => {
    const s = useStore.getState();
    if (s.readOnly || s.mode !== 'select' || e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    s.select({ type: 'zone', id: zone.id });
    hold.start(e);
  };

  // A flat translucent floor area. Nodes sit on top of it and win clicks (they stop propagation).
  return (
    <group position={[zone.position[0], hold.lifted ? 0.35 : 0, zone.position[2]]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} onPointerDown={onDown} onPointerMove={hold.move}
        onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}
      >
        <shapeGeometry args={[shape, 10]} />
        <meshBasicMaterial color={zone.color} transparent opacity={selected || hovered || hold.lifted ? 0.24 : 0.14} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, -0.47, 0]}>
        <Line points={outline} color={zone.color} lineWidth={selected ? 2.4 : 1.5} raycast={() => null} />
        {editable && !hold.lifted && selected &&
          CORNERS.map((c) => <ZoneHandle key={c.join()} zone={zone} corner={c} onHover={setHovered} />)}
      </group>
      <Label
        position={[-w / 2, -0.4, -d / 2]} className={`zone-label ${selected ? 'selected' : ''}`} priority={selected ? 2.5 : 1}
        onClick={() => useStore.getState().select({ type: 'zone', id: zone.id })}
      >
        <span className="dot" style={{ background: zone.color }} />{zone.label}
      </Label>
    </group>
  );
}

// The camera tilt is locked; you can only swing around the scene (azimuth), pan on the floor and zoom.
export const ELEVATION = THREE.MathUtils.degToRad(30);
const RESET_AZIMUTH = Math.PI / 4;
const dirFor = (az) => new THREE.Vector3(
  Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION));

function CameraRig({ controls }) {
  const view = useStore((s) => s.view);
  const { camera, size } = useThree();

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { nodes, zones } = useStore.getState().data;
    const box = new THREE.Box3();
    nodes.forEach((n) => box.expandByPoint(new THREE.Vector3(...n.position)));
    zones.forEach((z) => {
      const p = new THREE.Vector3(...z.position), h = new THREE.Vector3(...z.size).multiplyScalar(0.5);
      box.expandByPoint(p.clone().add(h)); box.expandByPoint(p.clone().sub(h));
    });
    const hasContent = !box.isEmpty();
    const center = hasContent ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const name = view?.name ?? 'reset';
    const cur = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
    // Rotations snap to the quarter-turn grid around the default azimuth.
    const snapped = Math.round((cur - RESET_AZIMUTH) / (Math.PI / 2)) * (Math.PI / 2) + RESET_AZIMUTH;
    const az = name === 'rotL' ? snapped - Math.PI / 2 : name === 'rotR' ? snapped + Math.PI / 2
      : name === 'fit' ? cur : RESET_AZIMUTH;
    const recentre = name === 'fit' || name === 'reset';
    let target = recentre ? center.clone() : c.target.clone();
    let zoom = null;
    if (recentre) {
      // Fit by projecting the content's bounding box onto the camera's screen axes, then centre the
      // *projected* box (not just the 3D centre) and zoom so it fills the viewport with a margin.
      let w = 14, h = 14;
      if (hasContent) {
        const fwd = dirFor(az).negate();
        const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
        const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
        const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        // measure the real content (nodes + zone corners), not the plan's bounding rectangle, so L-shaped
        // layouts don't leave empty margins
        const pts = [];
        for (const n of nodes) for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const cy of [-0.5, 1.8]) pts.push(new THREE.Vector3(n.position[0] + dx, cy, n.position[2] + dz));
        for (const z of zones) for (const dx of [-1, 1]) for (const dz of [-1, 1]) pts.push(new THREE.Vector3(z.position[0] + (dx * z.size[0]) / 2, -0.5, z.position[2] + (dz * z.size[2]) / 2));
        for (const p of pts) {
          const px = p.dot(right), py = p.dot(up);
          lo[0] = Math.min(lo[0], px); hi[0] = Math.max(hi[0], px); lo[1] = Math.min(lo[1], py); hi[1] = Math.max(hi[1], py);
        }
        w = Math.max(hi[0] - lo[0], 6) + 3; h = Math.max(hi[1] - lo[1], 6) + 3;
        // shift the pivot along the floor so the projected box sits in the middle of the screen
        const mx = (lo[0] + hi[0]) / 2 - center.dot(right);
        const my = (lo[1] + hi[1]) / 2 - center.dot(up);
        const ground = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)); // away from the camera
        target = center.clone().addScaledVector(right, mx).addScaledVector(ground, my / ground.dot(up));
        target.y = 0;
      }
      zoom = Math.max(10, Math.min(size.width / w, size.height / h) * 0.94);
    }
    c.target.copy(target);
    camera.position.copy(target).addScaledVector(dirFor(az), 60);
    if (zoom) camera.zoom = zoom;
    camera.updateProjectionMatrix();
    c.update();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Directional light with a shadow frustum that follows the orbit target.
function Sun() {
  const light = useRef();
  const controls = useThree((st) => st.controls);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const t = controls?.target ?? new THREE.Vector3();
    l.position.set(t.x - 12, 11, t.z + 6);
    l.target.position.copy(t);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light} intensity={1.5} castShadow
      shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
      shadow-camera-left={-38} shadow-camera-right={38} shadow-camera-top={38} shadow-camera-bottom={-38}
      shadow-camera-near={1} shadow-camera-far={80}
    />
  );
}

export function Scene() {
  const data = useStore((s) => s.data);
  const orbitLocked = useStore((s) => s.dragging || s.hovering);
  const controls = useRef();
  const byId = useMemo(() => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  return (
    <Canvas
      shadows orthographic camera={{ position: [30, 24, 30], zoom: 50, near: -500, far: 500 }}
      dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onPointerMissed={() => {
        const s = useStore.getState();
        if (s.mode === 'select') s.select(null);
      }}
    >
      <color attach="background" args={['#eceef4']} />
      <ambientLight intensity={1.05} />
      <Sun />
      <directionalLight position={[-6, 4, -8]} intensity={0.45} />
      {/* Invisible floor that only shows the shadows cast on it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.494, 0]} receiveShadow raycast={() => null}>
        <planeGeometry args={[800, 800]} />
        <shadowMaterial opacity={0.4} />
      </mesh>
      {/* Floor grid: fine 1-unit lines, slightly heavier every 5. Kept low-contrast so it recedes. */}
      <Grid
        position={[0, -0.5, 0]} infiniteGrid cellSize={1} sectionSize={5}
        cellColor="#d2d6e0" sectionColor="#b9bfce" cellThickness={0.8} sectionThickness={1.2}
        fadeDistance={90} fadeStrength={1.5}
      />
      <OrbitControls
        ref={controls} makeDefault enabled={!orbitLocked} enableDamping dampingFactor={0.2}
        minPolarAngle={Math.PI / 2 - ELEVATION} maxPolarAngle={Math.PI / 2 - ELEVATION} screenSpacePanning={false}
        zoomToCursor minZoom={8} maxZoom={300}
      />
      <CameraRig controls={controls} />
      <ContextHandler />
      <LabelLayout />
      {data.zones.map((z) => <ZoneView key={z.id} zone={z} />)}
      {data.connectors.map((c) => byId[c.from] && byId[c.to] && (
        <ConnectorView key={c.id} connector={c} from={byId[c.from]} to={byId[c.to]} />
      ))}
      {data.nodes.map((n) => <NodeView key={n.id} node={n} />)}
    </Canvas>
  );
}
