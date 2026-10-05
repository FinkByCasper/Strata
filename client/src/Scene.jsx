import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { polylineMidpoint, routePoints } from './model';
import { RichText } from './richtext';

const UP = new THREE.Vector3(0, 1, 0);

// Right-click plumbing. Objects record themselves as the target on right pointer-up; the canvas
// listener (which fires in the same tick) then opens the menu for that target, or the "empty" menu.
let ctxTarget = null;
const openMenuFor = (target, e, world = null) => {
  const st = useStore.getState();
  if (st.readOnly) return;
  st.select(target);
  st.openMenu({ x: e.clientX, y: e.clientY, target, world });
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
      if (moved) { ctxTarget = null; return; }
      const { clientX, clientY } = e;
      setTimeout(() => {
        const target = ctxTarget; ctxTarget = null;
        const rect = el.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = new THREE.Vector3();
        let world = null;
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const q = useStore.getState().snap ? Math.round : (v) => Math.round(v * 20) / 20;
          world = [q(hit.x), 0, q(hit.z)];
        }
        openMenuFor(target, { clientX, clientY }, world);
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
function Label({ position, children, className = '', onClick, target }) {
  const gl = useThree((s) => s.gl);
  return (
    <Html position={position} center zIndexRange={[20, 0]} pointerEvents="none">
      <div
        className={`label ${className}`}
        onPointerDown={(e) => { if (onClick && e.button === 0) { e.stopPropagation(); onClick(e); } }}
        onContextMenu={(e) => { e.preventDefault(); if (target) { e.stopPropagation(); openMenuFor(target, e); } }}
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

function NodeView({ node }) {
  const selected = useStore((s) => s.selection?.type === 'node' && s.selection.id === node.id);
  const connecting = useStore((s) => s.connectFrom === node.id);
  const camera = useThree((s) => s.camera);
  const drag = useRef(null);
  const yOffset = node.shape === 'slab' ? -0.375 : 0;

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
    if (!pick()) return;
    const s = useStore.getState();
    const plane = new THREE.Plane(UP, -node.position[1]);
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(plane, hit);
    e.target.setPointerCapture(e.pointerId);
    drag.current = {
      plane, clientY: e.nativeEvent.clientY, y: node.position[1],
      dx: hit.x - node.position[0], dz: hit.z - node.position[2], moved: false,
    };
    s.setDragging(true);
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const s = useStore.getState();
    const q = s.snap ? (v) => Math.round(v) : (v) => Math.round(v * 20) / 20;
    let [x, y, z] = node.position;
    if (e.nativeEvent.shiftKey) {
      // Shift+drag: move vertically. On-screen pixels map ~1:1 to world units * zoom (orthographic).
      y = q(d.y + (d.clientY - e.nativeEvent.clientY) / camera.zoom);
    } else {
      const hit = new THREE.Vector3();
      if (!e.ray.intersectPlane(d.plane, hit)) return;
      x = q(hit.x - d.dx); z = q(hit.z - d.dz);
    }
    if (x !== node.position[0] || y !== node.position[1] || z !== node.position[2]) {
      d.moved = true;
      s.updateNode(node.id, { position: [x, y, z] });
    }
  };

  const onUp = (e) => {
    if (e.nativeEvent.button === 2) ctxTarget = { type: 'node', id: node.id };
    if (!drag.current) return;
    drag.current = null;
    e.target.releasePointerCapture?.(e.pointerId);
    useStore.getState().setDragging(false);
  };

  const hover = (on) => () => {
    const s = useStore.getState();
    // Orbit must already be off by pointer-down (OrbitControls reads it first), so key off hover.
    if (!s.readOnly) s.setHovering(on);
    document.body.style.cursor = on ? (s.mode === 'connect' ? 'crosshair' : s.readOnly ? 'pointer' : 'grab') : '';
  };

  return (
    <group position={node.position}>
      <mesh
        position={[0, yOffset, 0]} scale={selected ? 1.05 : 1}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
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
        target={{ type: 'node', id: node.id }}
        onClick={pick}
      >
        <div className="title">
          {(node.shape === 'slab' || !node.icon) && <IconGlyph icon={node.icon} />}
          {node.label || <em>Untitled</em>}
        </div>
        {selected && node.description && <RichText text={node.description} />}
      </Label>
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
        onPointerUp={(e) => { if (e.nativeEvent.button === 2) ctxTarget = { type: 'connector', id: connector.id }; }}
      />
      {connector.arrow && (
        <mesh position={end.clone().addScaledVector(dir, -0.17)} quaternion={quat} onClick={select}>
          <coneGeometry args={[0.13, 0.34, 14]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {connector.label && (
        <Label position={polylineMidpoint(points)} className="line-label" onClick={select} target={{ type: 'connector', id: connector.id }}>
          {connector.label}
        </Label>
      )}
    </group>
  );
}

function ZoneView({ zone }) {
  const selected = useStore((s) => s.selection?.type === 'zone' && s.selection.id === zone.id);
  const [w, h, d] = zone.size;
  return (
    <group position={zone.position}>
      {/* Not raycastable: nodes inside a zone must stay clickable. Zones are picked via their label. */}
      <mesh raycast={() => null}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial color={zone.color} transparent opacity={selected ? 0.14 : 0.07} depthWrite={false} />
        <Edges color={zone.color} />
      </mesh>
      <Label
        position={[-w / 2, h / 2, -d / 2]} className={`zone-label ${selected ? 'selected' : ''}`}
        target={{ type: 'zone', id: zone.id }}
        onClick={() => useStore.getState().select({ type: 'zone', id: zone.id })}
      >
        <span className="dot" style={{ background: zone.color }} />{zone.label}
      </Label>
    </group>
  );
}

const VIEWS = { iso: [1, 0.8, 1], front: [0, 0, 1], right: [1, 0, 0], top: [0.0001, 1, 0.0001] };

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
    const name = view?.name ?? 'iso';
    // Keep the current direction on "fit"; otherwise snap to the named view.
    const dir = name === 'fit' ? camera.position.clone().sub(c.target).normalize()
      : new THREE.Vector3(...(VIEWS[name] ?? VIEWS.iso)).normalize();
    c.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, 60);
    camera.zoom = Math.max(12, Math.min(size.width, size.height) / extent);
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
