import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { GROUND, UP, camState, useHoldMove } from './hold';
import { LabelLayout, openAddMenu } from './labels';
import { FloorTiles, NodeLabels, NodesLayer } from './nodes';
import { ConnectorsLayer } from './connectors';

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
    if (s.readOnly || s.mode !== 'select' || e.nativeEvent.button !== 0) return;   // view-only selects on click instead (below)
    e.stopPropagation();
    s.select({ type: 'zone', id: zone.id });
    hold.start(e);
  };

  // View-only: a click (not a drag, which rotates) just selects the zone, which spotlights what is inside it. No panel opens.
  const onClick = (e) => {
    const s = useStore.getState();
    if (!s.readOnly) return;
    e.stopPropagation();
    s.select({ type: 'zone', id: zone.id });
  };

  // A flat translucent floor area. Nodes sit on top of it and win clicks (they stop propagation).
  return (
    <group position={[zone.position[0], hold.lifted ? 0.35 : 0, zone.position[2]]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} onPointerDown={onDown} onClick={onClick} onPointerMove={hold.move}
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
  useFrame(() => {
    const c = controls.current;
    if (c) { camState.azimuth = c.getAzimuthalAngle(); camState.zoom = camera.zoom; }
  });

  // With the tilt locked at 30°, a step along the ground in the viewing direction only moves 1/2 as far on screen
  // (sin 30°) as a sideways step, so dragging up/down panned half as fast as left/right. Boost the along-view part
  // of a pan by 1/sin(tilt) so the floor follows the cursor 1:1 in both directions.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const last = c.target.clone(), d = new THREE.Vector3(), f = new THREE.Vector3();
    let panning = false;
    const down = (e) => { panning = e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey; };
    const up = () => { panning = false; };
    const onChange = () => {
      if (panning) {
        d.copy(c.target).sub(last);
        f.set(camera.position.x - c.target.x, 0, camera.position.z - c.target.z).normalize();   // ground direction along the view
        const extra = d.dot(f) * (1 / Math.sin(ELEVATION) - 1);
        c.target.addScaledVector(f, extra);
        camera.position.addScaledVector(f, extra);
      }
      last.copy(c.target);
    };
    // OrbitControls only leaves "rotating"/"panning" when it sees the matching pointer-up. If that is ever lost (the
    // window loses focus mid-drag, a menu opens, the button is released over something that swallows it) it stays
    // stuck and every later mouse move or scroll turns the camera with no button pressed. Notice that (a move with
    // no buttons while we think one is down) and send the missing release.
    let held = false;
    const pressed = () => { held = true; };
    const released = () => { held = false; };
    const unstick = (e) => {
      if (!held || e.pointerType === 'touch' || e.buttons !== 0) return;
      held = false;
      const doc = c.domElement?.ownerDocument ?? document;
      doc.dispatchEvent(new PointerEvent('pointerup', { pointerId: e.pointerId, pointerType: e.pointerType, bubbles: true }));
    };
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true);
    window.addEventListener('pointerdown', pressed, true); window.addEventListener('pointerup', released, true); window.addEventListener('pointercancel', released, true);
    window.addEventListener('pointermove', unstick, true); window.addEventListener('blur', unstick);
    c.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointerdown', pressed, true); window.removeEventListener('pointerup', released, true); window.removeEventListener('pointercancel', released, true);
      window.removeEventListener('pointermove', unstick, true); window.removeEventListener('blur', unstick);
      c.removeEventListener('change', onChange);
    };
  }, [controls, camera]);

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

// Directional light with a shadow frustum that follows the orbit target. The shadow map is the most expensive
// thing on screen, so it is only re-rendered when something that affects it changed: the diagram, a node being
// moved, or the (grid-snapped) area it covers; not on every camera frame.
const SHADOW_STEP = 6;
function Sun() {
  const light = useRef();
  const controls = useThree((st) => st.controls);
  const gl = useThree((st) => st.gl);
  const last = useRef('');
  useEffect(() => { gl.shadowMap.autoUpdate = false; return () => { gl.shadowMap.autoUpdate = true; }; }, [gl]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const t = controls?.target ?? new THREE.Vector3();
    const tx = Math.round(t.x / SHADOW_STEP) * SHADOW_STEP, tz = Math.round(t.z / SHADOW_STEP) * SHADOW_STEP;
    l.position.set(tx - 12, 11, tz + 6);
    l.target.position.set(tx, 0, tz);
    l.target.updateMatrixWorld();
    const st = useStore.getState();
    const key = `${tx},${tz}`;
    if (key !== last.current || st.data !== lastData || st.liftedId !== lastLift) {
      last.current = key; lastData = st.data; lastLift = st.liftedId;
      burst = 12;   // instances and models mount a few frames after the data changes
    }
    if (burst > 0 || st.dragging) { burst--; gl.shadowMap.needsUpdate = true; }
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
let lastData = null, lastLift = null, burst = 0;

export function Scene() {
  const data = useStore((s) => s.data);
  const orbitLocked = useStore((s) => s.dragging || s.hovering);
  const controls = useRef();
  // Clicking empty floor clears the selection, but moving the camera (any drag, however small, or a
  // right-click/drag, or a wheel/rotate) must not: remember where and how the press started.
  const press = useRef(null);
  useEffect(() => {
    const down = (e) => { press.current = { x: e.clientX, y: e.clientY, az: camState.azimuth, zoom: camState.zoom }; };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);
  const clearOnEmptyClick = (e) => {
    if (e.type !== 'click' || e.button !== 0) return;
    const p = press.current;
    if (p && (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4 || Math.abs(camState.azimuth - p.az) > 1e-3 || Math.abs(camState.zoom - p.zoom) > 1e-3)) return;
    const s = useStore.getState();
    if (s.mode === 'select') s.select(null);
  };

  return (
    <Canvas
      shadows orthographic camera={{ position: [30, 24, 30], zoom: 50, near: -500, far: 500 }}
      dpr={[1, 1.5]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onPointerMissed={clearOnEmptyClick}
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
      <FloorTiles />
      <ConnectorsLayer />
      <NodesLayer />
      <NodeLabels />
    </Canvas>
  );
}
