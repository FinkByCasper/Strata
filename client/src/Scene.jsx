import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
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
  useFrame(({ gl }) => {
    const t0 = performance.now();
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
    // Cheap perf counters for stress testing (read from the console: window.__strataPerf).
    const perf = (window.__strataPerf ??= { labelMs: 0 });
    perf.labelMs = perf.labelMs * 0.9 + (performance.now() - t0) * 0.1;
    perf.labels = items.length;
    perf.calls = gl.info.render.calls;
    perf.triangles = gl.info.render.triangles;
  });
  return null;
}

const IconGlyph = ({ icon }) =>
  !icon ? null : icon.startsWith('data:') ? <img src={icon} alt="" className="glyph" /> : <span className="glyph">{icon}</span>;

function NodeShape({ shape }) {
  switch (shape) {
    case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 40]} />;
    case 'sphere': return <sphereGeometry args={[0.5, 40, 28]} />;
    case 'slab': return <boxGeometry args={[3, 0.25, 3]} />;   // a 3x3-cell platform, so its edges stay on cell borders
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

const MODEL_SCALE = 1; // device models are designed to fill one grid cell

// Soft radial blob drawn on the floor under a node. Real cast shadows are directional and vanish for low
// objects (a chip, a switch); this keeps everything grounded, like a drop shadow.
let blobTexture;
function getBlobTexture() {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(c);
  }
  return blobTexture;
}
function ContactShadow({ size, opacity = 0.5 }) {
  const map = useMemo(getBlobTexture, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.12, -0.492, 0.1]} raycast={() => null} renderOrder={-1}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={map} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
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

// The floor tile every node stands on: fills its whole grid square (cell borders at +-0.5) in a pale tint of
// the node's colour, with a thin outline on the cell border.
function FloorTile({ color }) {
  const tint = useMemo(() => '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55).getHexString(), [color]);
  const edge = useMemo(() => [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 0, -0.5]], []);
  return (
    <group position={[0, -0.497, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={tint} transparent opacity={1} depthWrite={false} toneMapped={false} />
      </mesh>
      <group position={[0, 0.001, 0]}>
        <Line points={edge} color={color} lineWidth={1.6} transparent opacity={0.85} raycast={() => null} />
      </group>
    </group>
  );
}

// A flat square exactly covering the node's grid cell(s) (cells are centred on whole numbers).
function CellMarker({ size, color, fill, outline }) {
  const h = size / 2;
  const edge = useMemo(() => [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [-h, 0, -h]], [h]);
  return (
    <group position={[0, -0.47, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={color} transparent opacity={fill} depthWrite={false} />
      </mesh>
      {outline && <Line points={edge} color={color} lineWidth={2} raycast={() => null} />}
    </group>
  );
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
  const cell = node.shape === 'slab' ? 3 : 1;   // footprint in grid cells
  const glow = selected || connecting;
  // Models are scaled about their base (floor at y = -0.5), so they keep standing on the floor.
  const baseLift = basic ? 0 : 0.5 * (MODEL_SCALE - 1);
  const labelY = basic ? (LABEL_Y[node.shape] ?? 1.05) : baseLift + (LABEL_Y[node.shape] ?? 1.05) * MODEL_SCALE;
  const body = useRef();
  useShadowFlags(body);

  // Handlers sit on the group so they fire for every part of a multi-mesh device model.
  return (
    <group position={node.position}>
      {hold.lifted && <CellMarker size={cell} color={node.color} fill={0.45} />}
      {node.shape !== 'slab' && !hold.lifted && <FloorTile color={node.color} />}
      {!hold.lifted && <ContactShadow size={node.shape === 'slab' ? 4.2 : 1.7} />}
      {glow && !hold.lifted && <CellMarker size={cell} color={connecting ? '#f5a524' : '#4f8cff'} fill={0.22} outline />}
      <group position={[0, hold.lifted ? 0.5 : 0, 0]}>
        <group
          ref={body} position={[0, baseLift, 0]} scale={(hold.lifted ? 1.1 : 1) * (basic ? 1 : MODEL_SCALE)}
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

// Text drawn onto a flat plane lying on the floor (no font files needed: it is painted on a canvas).
// Reads along +x with its top toward -z, like the zone titles in isometric network diagrams.
function FloorText({ text, color, maxWidth, maxHeight = 0.85, opacity = 1 }) {
  const { tex, aspect } = useMemo(() => {
    const px = 96, pad = 20;
    const font = `italic 800 ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    c.width = Math.min(4096, Math.ceil(g.measureText(text).width) + pad * 2);
    c.height = Math.round(px * 1.4);
    g.font = font; g.textBaseline = 'middle'; g.fillStyle = new THREE.Color(color).multiplyScalar(0.45).getStyle();
    g.fillText(text, pad, c.height / 2 + 2, c.width - pad * 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return { tex: t, aspect: c.width / c.height };
  }, [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const height = Math.min(maxHeight, maxWidth / aspect); // shrink to fit if the space is short
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
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
  // The zone's name is drawn flat on the floor, just outside one edge (or hidden).
  const labelMode = zone.labelMode ?? 'edge';
  const edge = zone.labelEdge ?? 'back';
  const gap = 0.75;
  const textPos = { back: [0, -0.46, -d / 2 - gap], front: [0, -0.46, d / 2 + gap], left: [-w / 2 - gap, -0.46, 0], right: [w / 2 + gap, -0.46, 0] }[edge];
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
      {labelMode === 'edge' && zone.label && (
        <group position={textPos} rotation={[0, edge === 'left' || edge === 'right' ? Math.PI / 2 : 0, 0]}>
          <FloorText text={zone.label} color={zone.color} maxWidth={edge === 'left' || edge === 'right' ? d : w} />
        </group>
      )}
      {/* "Centre": a big darker-tinted watermark that fills the zone, running along its longer side. */}
      {labelMode === 'center' && zone.label && (
        <group position={[0, -0.465, 0]} rotation={[0, d > w ? Math.PI / 2 : 0, 0]}>
          <FloorText text={zone.label} color={zone.color} opacity={0.6}
            maxWidth={Math.max(w, d) * 0.9} maxHeight={Math.min(w, d) * 0.6} />
        </group>
      )}
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

// Floor grid. Lines are computed from *world* coordinates, so the pattern can be phase-shifted by half a cell:
// grid lines then sit on cell borders and every whole-number position (where nodes live) is a cell centre.
// The quad follows the orbit target and fades out with distance, so it feels endless.
const GRID_VERT = /* glsl */`
  uniform vec3 center;
  varying vec3 wp;
  void main() {
    wp = vec3(position.x * 600.0 + center.x, center.y, position.y * 600.0 + center.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const GRID_FRAG = /* glsl */`
  uniform vec3 center;
  uniform vec3 cellColor;
  uniform vec3 sectionColor;
  uniform vec2 phase;
  uniform float cellSize, sectionSize, cellThickness, sectionThickness, fadeDistance, fadeStrength;
  varying vec3 wp;
  float lines(float size, float thickness) {
    vec2 r = (wp.xz + phase) / size;
    vec2 g = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    return 1.0 - min(min(g.x, g.y) + 1.0 - thickness, 1.0);
  }
  void main() {
    float g1 = lines(cellSize, cellThickness);
    float g2 = lines(sectionSize, sectionThickness);
    float d = 1.0 - min(distance(center.xz, wp.xz) / fadeDistance, 1.0);
    vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));
    float a = 0.55 * (g1 + g2) * pow(d, fadeStrength);
    a = mix(0.75 * a, a, g2);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(color, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function FloorGrid({ y = -0.5, cell = 1, section = 5 }) {
  const controls = useThree((st) => st.controls);
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: GRID_VERT, fragmentShader: GRID_FRAG,
    uniforms: {
      center: { value: new THREE.Vector3(0, y, 0) },
      cellColor: { value: new THREE.Color('#d2d6e0') }, sectionColor: { value: new THREE.Color('#b9bfce') },
      phase: { value: new THREE.Vector2(-0.5, -0.5) },   // lines at k + 0.5
      cellSize: { value: cell }, sectionSize: { value: section },
      cellThickness: { value: 0.8 }, sectionThickness: { value: 1.2 },
      fadeDistance: { value: 80 }, fadeStrength: { value: 1.3 },
    },
  }), [y, cell, section]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const t = controls?.target;
    if (t) material.uniforms.center.value.set(t.x, y, t.z);
  });
  return (
    <mesh frustumCulled={false} material={material} renderOrder={-2} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
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
      shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.015}
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
      <FloorGrid />
      <OrbitControls
        ref={controls} makeDefault enableRotate={!orbitLocked} enablePan={!orbitLocked} enableDamping dampingFactor={0.2}
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
