import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { polylineMidpoint, routePoints } from './model';
import { RichText } from './richtext';

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
function Label({ position, children, className = '', onClick }) {
  const gl = useThree((s) => s.gl);
  return (
    <Html position={position} center zIndexRange={[20, 0]} pointerEvents="none">
      <div
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

  return (
    <group position={node.position}>
      {hold.lifted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.47, 0]} raycast={() => null}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial color={node.color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      <group position={[0, hold.lifted ? 0.5 : 0, 0]}>
      <mesh
        position={[0, yOffset, 0]} scale={hold.lifted ? 1.1 : selected ? 1.05 : 1}
        onPointerDown={onDown} onPointerMove={hold.move}
        onPointerOver={hover(true)} onPointerOut={hover(false)}
      >
        <NodeShape shape={node.shape} />
        <meshStandardMaterial
          color={node.color} roughness={0.55} metalness={0.05}
          emissive={selected || connecting ? node.color : '#000'} emissiveIntensity={connecting ? 0.7 : 0.3}
        />
        {(selected || connecting) && <Edges color="#111827" />}
      </mesh>
      {node.icon && node.shape !== 'slab' && (
        <Html center position={[0, 0, 0]} zIndexRange={[10, 0]} className="passthrough">
          <div className="onshape"><IconGlyph icon={node.icon} /></div>
        </Html>
      )}
      <Label
        position={[0, node.shape === 'slab' ? 0.55 : 1.05, 0]}
        className={selected ? 'selected' : ''}
        onClick={pick}
      >
        <div className="title">
          {(node.shape === 'slab' || !node.icon) && <IconGlyph icon={node.icon} />}
          {node.label || <em>Untitled</em>}
        </div>
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
  const color = selected ? '#111827' : connector.color || '#475569';
  const end = points[points.length - 1];
  const dir = end.clone().sub(points[points.length - 2]).normalize();
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir), [dir.x, dir.y, dir.z]);
  const select = (e) => { e.stopPropagation(); useStore.getState().select({ type: 'connector', id: connector.id }); };

  return (
    <group>
      <Line
        points={points} color={color} lineWidth={selected ? 3.5 : 2.2}
        dashed={connector.line === 'dashed'} dashSize={0.25} gapSize={0.18}
        onClick={select}
      />
      {connector.arrow && (
        <mesh position={end.clone().addScaledVector(dir, -0.17)} quaternion={quat} onClick={select}>
          <coneGeometry args={[0.13, 0.34, 14]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {connector.label && (
        <Label position={polylineMidpoint(points)} className="line-label" onClick={select}>
          {connector.label}
        </Label>
      )}
    </group>
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

  return (
    <mesh
      position={[(sx * w) / 2, 0.02, (sz * d) / 2]} onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onLostPointerCapture={up} onPointerOver={over(true)} onPointerOut={over(false)}
    >
      <boxGeometry args={[0.5, 0.16, 0.5]} />
      <meshBasicMaterial color="#ffffff" />
      <Edges color={zone.color} lineWidth={2} />
    </mesh>
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
  const outline = useMemo(() => [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [-w / 2, 0, -d / 2]], [w, d]);

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
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={zone.color} transparent opacity={selected || hovered || hold.lifted ? 0.24 : 0.14} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, -0.47, 0]}>
        <Line points={outline} color={zone.color} lineWidth={selected ? 2.4 : 1.5} raycast={() => null} />
        {editable && !hold.lifted && (hovered || selected) &&
          CORNERS.map((c) => <ZoneHandle key={c.join()} zone={zone} corner={c} onHover={setHovered} />)}
      </group>
      <Label
        position={[-w / 2, -0.4, -d / 2]} className={`zone-label ${selected ? 'selected' : ''}`}
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
    const extent = hasContent ? Math.max(...box.getSize(new THREE.Vector3()).toArray(), 4) + 4 : 14;
    const name = view?.name ?? 'reset';
    const cur = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
    // Rotations snap to the quarter-turn grid around the default azimuth.
    const snapped = Math.round((cur - RESET_AZIMUTH) / (Math.PI / 2)) * (Math.PI / 2) + RESET_AZIMUTH;
    const az = name === 'rotL' ? snapped - Math.PI / 2 : name === 'rotR' ? snapped + Math.PI / 2
      : name === 'fit' ? cur : RESET_AZIMUTH;
    const recentre = name === 'fit' || name === 'reset';
    const target = recentre ? center : c.target.clone();
    c.target.copy(target);
    camera.position.copy(target).addScaledVector(dirFor(az), 60);
    if (recentre) camera.zoom = Math.max(12, Math.min(size.width, size.height) / extent);
    camera.updateProjectionMatrix();
    c.update();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function Scene() {
  const data = useStore((s) => s.data);
  const orbitLocked = useStore((s) => s.dragging || s.hovering);
  const controls = useRef();
  const byId = useMemo(() => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  return (
    <Canvas
      orthographic camera={{ position: [30, 24, 30], zoom: 50, near: -500, far: 500 }}
      dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onPointerMissed={() => {
        const s = useStore.getState();
        if (s.mode === 'select') s.select(null);
      }}
    >
      <color attach="background" args={['#f4f5f8']} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[8, 14, 6]} intensity={1.6} />
      <directionalLight position={[-6, 4, -8]} intensity={0.5} />
      {/* Blender-style floor: fine 1-unit lines, heavier every 5, coloured X (red) and Z (green) axes. */}
      <Grid
        position={[0, -0.5, 0]} infiniteGrid cellSize={1} sectionSize={5}
        cellColor="#b9c0d0" sectionColor="#7d879e" cellThickness={0.9} sectionThickness={1.6}
        fadeDistance={90} fadeStrength={1.5}
      />
      <Line points={[[-500, -0.49, 0], [500, -0.49, 0]]} color="#e5484d" lineWidth={2.2} raycast={() => null} />
      <Line points={[[0, -0.49, -500], [0, -0.49, 500]]} color="#2fb170" lineWidth={2.2} raycast={() => null} />
      <OrbitControls
        ref={controls} makeDefault enabled={!orbitLocked} enableDamping dampingFactor={0.2}
        minPolarAngle={Math.PI / 2 - ELEVATION} maxPolarAngle={Math.PI / 2 - ELEVATION} screenSpacePanning={false}
        zoomToCursor minZoom={8} maxZoom={300}
      />
      <CameraRig controls={controls} />
      <ContextHandler />
      {data.zones.map((z) => <ZoneView key={z.id} zone={z} />)}
      {data.connectors.map((c) => byId[c.from] && byId[c.to] && (
        <ConnectorView key={c.id} connector={c} from={byId[c.from]} to={byId[c.to]} />
      ))}
      {data.nodes.map((n) => <NodeView key={n.id} node={n} />)}
    </Canvas>
  );
}
