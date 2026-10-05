import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { useHoldMove } from './hold';
import { BASIC_KINDS, NO_SHADOW, TINT_ROLES, labelY, materialFor, partsFor } from './parts';
import { IconGlyph, Label, lodFor, usePortal } from './labels';
import { RichText } from './richtext';

// Connect-mode click, or plain selection. Returns whether a press-and-hold pick-up may start.
export function pickNode(id) {
  const s = useStore.getState();
  if (s.mode === 'connect' && !s.readOnly) { s.connectClick(id); return false; }
  s.select({ type: 'node', id });
  return !s.readOnly;
}

const setHover = (on) => {
  const s = useStore.getState();
  // Orbit must already be off by pointer-down (OrbitControls reads it first), so key off hover.
  if (!s.readOnly) s.setHovering(on);
  document.body.style.cursor = on ? (s.mode === 'connect' ? 'crosshair' : 'pointer') : '';
};

// A flat square exactly covering the node's grid cell(s) (cells are centred on whole numbers).
function CellMarker({ size, color, fill, outline, position }) {
  const h = size / 2;
  const edge = useMemo(() => [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [-h, 0, -h]], [h]);
  return (
    <group position={[position[0], -0.47, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={color} transparent opacity={fill} depthWrite={false} />
      </mesh>
      {outline && <Line points={edge} color={color} lineWidth={2} raycast={() => null} />}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Node bodies. All nodes of one kind share baked geometry and are drawn with one InstancedMesh per
// material role, so the number of draw calls depends on the number of kinds, not on the node count.
// ---------------------------------------------------------------------------------------------
function PartInstances({ kind, part, list, focus, h }) {
  const ref = useRef();
  const material = useMemo(() => materialFor(part.role), [part.role]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D(), c = new THREE.Color();
    list.forEach((n, i) => {
      o.position.set(n.position[0], n.position[1], n.position[2]);
      o.scale.setScalar(focus.has(n.id) ? 0.0001 : 1);   // focused nodes are drawn separately, with a glow
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (TINT_ROLES.has(part.role)) m.setColorAt(i, c.set(n.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();   // raycasting uses it, so it must follow the instances
  });
  return (
    <instancedMesh
      key={`${kind}-${part.role}-${list.length}`} ref={ref} args={[part.geometry, material, list.length]} frustumCulled={false}
      castShadow={!NO_SHADOW.has(part.role)} receiveShadow={part.role !== 'cast'}
      onPointerDown={(e) => { const n = list[e.instanceId]; if (n) h.onDown(n, e); }}
      onPointerMove={h.move}
      onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}
    />
  );
}

// The selected / connecting / carried node: ordinary meshes with a glow (and a lift while carried).
function FocusNode({ node, lifted, glow, h }) {
  const parts = partsFor(node.shape);
  return (
    <group
      position={[node.position[0], node.position[1] + (lifted ? 0.5 : 0), node.position[2]]} scale={lifted ? 1.1 : 1}
      onPointerDown={(e) => h.onDown(node, e)} onPointerMove={h.move}
      onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}
    >
      {parts.map((p) => (
        <mesh key={p.role} geometry={p.geometry} material={materialFor(p.role, node.color, glow)}
          castShadow={!NO_SHADOW.has(p.role)} receiveShadow={p.role !== 'cast'} />
      ))}
    </group>
  );
}

export function NodesLayer() {
  const nodes = useStore((s) => s.data.nodes);
  const selId = useStore((s) => (s.selection?.type === 'node' ? s.selection.id : null));
  const connectFrom = useStore((s) => s.connectFrom);
  const activeRef = useRef(null);
  const hold = useHoldMove(
    () => useStore.getState().data.nodes.find((n) => n.id === activeRef.current)?.position ?? [0, 0, 0],
    (x, z) => useStore.getState().updateNode(activeRef.current, { position: [x, 0, z] }),
  );
  const liftedId = hold.lifted ? activeRef.current : null;
  useEffect(() => { useStore.setState({ liftedId }); }, [liftedId]);

  const focus = useMemo(() => new Set([selId, connectFrom, liftedId].filter(Boolean)), [selId, connectFrom, liftedId]);
  const byKind = useMemo(() => {
    const m = new Map();
    for (const n of nodes) (m.get(n.shape) ?? m.set(n.shape, []).get(n.shape)).push(n);
    return m;
  }, [nodes]);
  const h = {
    move: hold.move,
    onDown: (node, e) => {
      e.stopPropagation();
      if (e.nativeEvent.button !== 0) return;
      if (pickNode(node.id)) { activeRef.current = node.id; hold.start(e); }
    },
  };

  return (
    <>
      {[...byKind].map(([kind, list]) => partsFor(kind).map((part) => (
        <PartInstances key={`${kind}-${part.role}`} kind={kind} part={part} list={list} focus={focus} h={h} />
      )))}
      {nodes.filter((n) => focus.has(n.id)).map((n) => (
        <React.Fragment key={n.id}>
          <FocusNode node={n} lifted={n.id === liftedId} glow={n.id === selId || n.id === connectFrom} h={h} />
          {n.id === liftedId
            ? <CellMarker position={n.position} size={1} color={n.color} fill={0.45} />
            : <CellMarker position={n.position} size={1} color={n.id === connectFrom ? '#f5a524' : '#4f8cff'} fill={0.22} outline />}
        </React.Fragment>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Floor tiles (a tinted square filling each node's cell) and soft contact shadows: one draw each.
// ---------------------------------------------------------------------------------------------
let blobTexture;
function getBlobTexture() {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(c);
  }
  return blobTexture;
}
const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export function FloorTiles() {
  const nodes = useStore((s) => s.data.nodes);
  const liftedId = useStore((s) => s.liftedId);
  const list = useMemo(() => nodes.filter((n) => n.shape !== 'slab' && n.id !== liftedId), [nodes, liftedId]);
  const tiles = useRef(), blobs = useRef(), lines = useRef();
  const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, opacity: 0.5, depthWrite: false }), []);
  const tileMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  const lineGeo = useMemo(() => {
    const pos = new Float32Array(list.length * 8 * 3), col = new Float32Array(list.length * 8 * 3), c = new THREE.Color();
    list.forEach((n, i) => {
      const [x, , z] = n.position, y = -0.496;
      const quad = [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]];
      c.set(n.color);
      for (let k = 0; k < 4; k++) {
        const a = quad[k], b = quad[(k + 1) % 4], o = (i * 8 + k * 2) * 3;
        pos.set([a[0], y, a[1], b[0], y, b[1]], o);
        col.set([c.r, c.g, c.b, c.r, c.g, c.b], o);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [list]);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  useLayoutEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color(), white = new THREE.Color('#ffffff');
    list.forEach((n, i) => {
      o.position.set(n.position[0], -0.497, n.position[2]); o.scale.set(1, 1, 1); o.updateMatrix();
      tiles.current?.setMatrixAt(i, o.matrix);
      tiles.current?.setColorAt(i, c.set(n.color).lerp(white, 0.55));
      o.position.set(n.position[0] + 0.12, -0.492, n.position[2] + 0.1); o.scale.set(1.7, 1, 1.7); o.updateMatrix();
      blobs.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [tiles.current, blobs.current]) { if (m) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } }
    if (tiles.current?.instanceColor) tiles.current.instanceColor.needsUpdate = true;
  });
  if (!list.length) return null;
  return (
    <>
      <instancedMesh key={`t${list.length}`} ref={tiles} args={[flatPlane, tileMat, list.length]} frustumCulled={false} renderOrder={-1} raycast={() => null} />
      <lineSegments geometry={lineGeo} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} />
      </lineSegments>
      <instancedMesh key={`b${list.length}`} ref={blobs} args={[flatPlane, blobMat, list.length]} frustumCulled={false} raycast={() => null} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Labels: DOM, so only those near the screen are created (and capped), and the amount of text shrinks
// as you zoom out: full (title + subtitle) -> title only -> none.
// ---------------------------------------------------------------------------------------------
const MAX_LABELS = 100;
const MINOR = new Set(['container', 'slab', 'box', 'cache', 'cylinder', 'sphere']);   // shown last when labels compete for space
export function NodeLabels() {
  const nodes = useStore((s) => s.data.nodes);
  const selId = useStore((s) => (s.selection?.type === 'node' ? s.selection.id : null));
  const connectFrom = useStore((s) => s.connectFrom);
  const liftedId = useStore((s) => s.liftedId);
  const { camera, size } = useThree();
  const [vis, setVis] = useState({ ids: new Set(), lod: 'full' });
  const prev = useRef('');
  const acc = useRef(1);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.2) return;
    acc.current = 0;
    const lod = lodFor(camera.zoom);
    const v = new THREE.Vector3(), near = [];
    if (lod !== 'off') {
      for (const n of nodes) {
        if (lod === 'title' && MINOR.has(n.shape) && n.id !== selId) continue;   // zoomed out: only the important ones are named
        v.set(n.position[0], 0.3, n.position[2]).project(camera);
        const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
        if (x < -100 || x > size.width + 100 || y < -100 || y > size.height + 100) continue;
        near.push([Math.hypot(x - size.width / 2, y - size.height / 2), n.id]);
      }
      near.sort((a, b) => a[0] - b[0]);
    }
    const ids = new Set(near.slice(0, MAX_LABELS).map((e) => e[1]));
    if (selId) ids.add(selId);
    if (connectFrom) ids.add(connectFrom);
    const key = lod + '|' + [...ids].sort().join(',');
    if (key !== prev.current) { prev.current = key; setVis({ ids, lod }); }
  });
  const portal = usePortal();
  return (
    <>
      {nodes.filter((n) => vis.ids.has(n.id)).map((n) => {
        const selected = n.id === selId, lift = n.id === liftedId ? 0.5 : 0;
        const full = vis.lod === 'full' || selected;
        const onShape = n.icon && BASIC_KINDS.includes(n.shape) && n.shape !== 'slab';
        return (
          <React.Fragment key={n.id}>
            {onShape && (
              <Html center position={[n.position[0], lift, n.position[2]]} zIndexRange={[10, 0]} className="passthrough" portal={portal}>
                <div className={`onshape ${/^[\w ]{2,}$/.test(n.icon) ? 'text' : ''}`}><IconGlyph icon={n.icon} /></div>
              </Html>
            )}
            <Label
              position={[n.position[0], lift + labelY(n.shape), n.position[2]]}
              className={`${selected ? 'selected' : ''} ${full ? '' : 'small'}`} priority={selected ? 3 : MINOR.has(n.shape) ? 1.8 : 2}
              onClick={() => pickNode(n.id)}
            >
              <div className="title">
                {n.icon && !onShape && <IconGlyph icon={n.icon} />}
                {n.label || <em>Untitled</em>}
              </div>
              {full && n.subtitle && <div className="sub">{n.subtitle}</div>}
              {selected && n.description && <RichText text={n.description} />}
            </Label>
          </React.Fragment>
        );
      })}
    </>
  );
}
