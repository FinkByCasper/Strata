import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { LineMaterial } from 'three-stdlib';
import { LineSegments2 } from 'three-stdlib';
import { LineSegmentsGeometry } from 'three-stdlib';
import { useStore } from './store';
import { isDrawable, polylineMidpoint, sameSpot, routePoints, routedPoints } from './model';
import { routeAll } from './routing.js';
import { resolveStyle } from './connectorStyle.js';
import { UP } from './hold';
import { Label, useLod } from './labels';
import { RichText } from './richtext';
import { useHighlight } from './highlight';
import { useTheme } from './theme';

const selectConnector = (id, e) => {
  const s = useStore.getState();
  if (e && (e.shiftKey || e.ctrlKey || e.metaKey) && !s.readOnly) s.toggleSelect({ type: 'connector', id });
  else s.select({ type: 'connector', id });
};

// Every connector under the pointer, nearest first. Clicking the same spot again steps to the next one, so
// lines stacked on top of each other can all be reached.
function pickConnector(raycaster, targets, idOf, current) {
  const ids = [];
  // R3F drops all but one hit per object (overlapping segments of one merged line would be lost), so ask the raycaster directly
  for (const hit of raycaster.intersectObjects(targets, false)) {
    const id = idOf(hit);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return null;
  const at = ids.indexOf(current);
  return at >= 0 ? ids[(at + 1) % ids.length] : ids[0];
}

// Connector lines are merged into one object per kind of line (solid or dashed, and each width in use) with per-segment colours, arrowheads are
// one instanced mesh per head shape, and the moving data dots one per dot shape, so the number of connectors barely affects draw calls.
export function ConnectorsLayer() {
  const connectors = useStore((s) => s.data.connectors);
  const nodes = useStore((s) => s.data.nodes);
  const defaults = useStore((s) => s.data.style?.connector);
  const picked = useStore((s) => s.picked.connector);
  const selId = useStore((s) => (s.multi.length === 0 && s.selection?.type === 'connector' ? s.selection.id : null));
  const { size, raycaster } = useThree();
  const lod = useLod();
  const hl = useHighlight();
  const dark = useTheme((st) => st.dark);
  const FADE = useMemo(() => new THREE.Color(dark ? '#0d1017' : '#eceef4'), [dark]);   // the floor colour: dimmed lines are mixed towards it

  const routes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const planned = routeAll(nodes, connectors);
    return connectors.flatMap((c) => {
      const a = byId.get(c.from), b = byId.get(c.to);
      if (!a || !b || sameSpot(a.position, b.position)) return [];
      const plan = planned.get(c.id);
      const [sx, sz] = plan?.shift ?? [0, 0];
      const pts = plan?.poly
        ? routedPoints(plan.poly, a.position[1])
        : routePoints([a.position[0] + sx, a.position[1], a.position[2] + sz], [b.position[0] + sx, b.position[1], b.position[2] + sz], c.route);
      return isDrawable(pts) ? [{ c, pts, st: resolveStyle(c, defaults) }] : [];
    });
  }, [connectors, nodes, defaults]);

  const lines = useMemo(() => {
    const make = (dashed, width) => {
      const pos = [], col = [], map = [], color = new THREE.Color();
      routes.forEach((r, ri) => {
        if ((r.c.line === 'dashed') !== dashed || r.st.lineWidth !== width) return;
        color.set(r.c.color || '#475569');
        if (hl && !hl.connectors.has(r.c.id)) color.lerp(FADE, 0.85);
        for (let i = 0; i < r.pts.length - 1; i++) {
          const p = r.pts[i], q = r.pts[i + 1];
          pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
          col.push(color.r, color.g, color.b, color.r, color.g, color.b);
          map.push(ri);
        }
      });
      if (!pos.length) return null;
      const g = new LineSegmentsGeometry().setPositions(pos).setColors(col);
      const m = new LineMaterial({ linewidth: width, vertexColors: true, dashed, dashSize: 0.25, gapSize: 0.18 });
      const l = new LineSegments2(g, m);
      if (dashed) l.computeLineDistances();
      l.frustumCulled = false;
      l.userData.map = map;
      return l;
    };
    const kinds = new Map(routes.map((r) => [`${r.c.line === 'dashed'}:${r.st.lineWidth}`, [r.c.line === 'dashed', r.st.lineWidth]]));
    return [...kinds.values()].map(([dashed, width]) => make(dashed, width)).filter(Boolean);
  }, [routes, hl, FADE]);
  useEffect(() => () => lines.forEach((l) => { l.geometry.dispose(); l.material.dispose(); }), [lines]);
  useEffect(() => { lines.forEach((l) => l.material.resolution.set(size.width, size.height)); }, [lines, size]);

  const heads = useRef({});
  const arrows = useMemo(() => {
    const byHead = new Map();
    const add = (head, entry) => (byHead.get(head) ?? byHead.set(head, []).get(head)).push(entry);
    for (const r of routes) {
      if (r.c.arrow) add(r.st.arrowHead, { r, tip: r.pts[r.pts.length - 1], from: r.pts[r.pts.length - 2] });
      if (r.c.arrowStart) add(r.st.arrowHead, { r, tip: r.pts[0], from: r.pts[1] });
    }
    return [...byHead];
  }, [routes]);
  const pickAt = (e) => {
    e.stopPropagation();
    const idOf = (hit) => (hit.object.userData.map ? routes[hit.object.userData.map[hit.faceIndex]]?.c.id : hit.object.userData.arrows?.[hit.instanceId]?.r.c.id);
    const id = pickConnector(raycaster, [...lines, ...Object.values(heads.current)].filter(Boolean), idOf, selId);
    if (id) selectConnector(id, e.nativeEvent);
  };

  const flowRoutes = useMemo(() => (hl ? routes.filter((r) => hl.connectors.has(r.c.id)) : routes), [routes, hl]);   // faded lines carry no moving dots
  return (
    <>
      {routes.filter((r) => picked.has(r.c.id)).map((r) => <Line key={r.c.id} points={r.pts} color="#4f8cff" lineWidth={Math.max(7, r.st.lineWidth + 4)} transparent opacity={0.35} raycast={() => null} />)}
      {lines.map((l, i) => (
        <primitive
          key={i} object={l}
          onClick={pickAt}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}
        />
      ))}
      {arrows.map(([head, items]) => <ArrowHeads key={head} head={head} items={items} picked={picked} hl={hl} fade={FADE} meshes={heads} onPick={pickAt} />)}
      {lod !== 'off' && routes.filter((r) => (r.c.label || r.c.subtitle || r.c.id === selId) && (!hl || hl.connectors.has(r.c.id))).map((r) => {
        const selected = r.c.id === selId, full = lod === 'full' || selected;
        return (
          <Label key={r.c.id} position={polylineMidpoint(r.pts)} className={`line-label ${selected ? 'selected' : ''} ${full ? '' : 'small'}`}
            onClick={(e) => selectConnector(r.c.id, e)} priority={selected ? 3 : 1.2}>
            <div className="title">{r.c.label || <em>Connection</em>}</div>
            {full && r.c.subtitle && <div className="sub">{r.c.subtitle}</div>}
            {selected && r.c.description && <RichText text={r.c.description} />}
          </Label>
        );
      })}
      <FlowBlobs routes={flowRoutes} />
    </>
  );
}

// Every head is drawn about 0.34 long, pointing along the line, so that one size setting means the same thing for all of them.
const HEADS = {
  cone: { geometry: new THREE.ConeGeometry(0.13, 0.34, 14), back: 0.17 },
  diamond: { geometry: new THREE.OctahedronGeometry(0.17).scale(0.75, 1, 0.75), back: 0.17 },
  dot: { geometry: new THREE.SphereGeometry(0.12, 14, 10), back: 0.12 },
  bar: { geometry: new THREE.CylinderGeometry(0.22, 0.22, 0.05, 18), back: 0.03 },
};
const headMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });

function ArrowHeads({ head, items, picked, hl, fade, meshes, onPick }) {
  const { geometry, back } = HEADS[head] ?? HEADS.cone;
  const mesh = useRef();
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    meshes.current[head] = m;
    const o = new THREE.Object3D(), c = new THREE.Color(), d = new THREE.Vector3();
    items.forEach(({ r, tip, from }, i) => {
      d.copy(tip).sub(from);
      const size = d.lengthSq() > 1e-8 ? r.st.arrowSize * (picked.has(r.c.id) ? 1.25 : 1) : 0;
      d.normalize();
      o.position.copy(tip).addScaledVector(d, -back * size);
      o.quaternion.setFromUnitVectors(UP, size ? d : UP);
      o.scale.setScalar(size);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(r.c.color || '#475569');
      if (hl && !hl.connectors.has(r.c.id)) c.lerp(fade, 0.85);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    return () => { if (meshes.current[head] === m) delete meshes.current[head]; };
  });
  return <instancedMesh key={items.length} ref={mesh} args={[geometry, headMaterial, items.length]} frustumCulled={false} userData={{ arrows: items }} onClick={onPick} />;
}

// ---------------------------------------------------------------------------------------------
// Data-flow dots: small shapes travelling along a connector in the arrow's direction, in the line's colour.
// "Both ways" adds a second stream in the return colour going the other way, in its own lane.
// ---------------------------------------------------------------------------------------------
const SPACING = 2.3, SPEED = 1.7, LANE = 0.1, MAX_BLOBS = 2000;
const FLOW_GEOMETRY = {
  sphere: new THREE.SphereGeometry(0.11, 14, 10),
  cube: new THREE.BoxGeometry(0.2, 0.2, 0.2),
  diamond: new THREE.OctahedronGeometry(0.16),
  dash: new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8),
};
const flowMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });

function FlowBlobs({ routes }) {
  const flows = useMemo(() => routes.filter((r) => r.c.flow === 'forward' || r.c.flow === 'both').map((r) => {
    const cum = [0];
    for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + r.pts[i].distanceTo(r.pts[i - 1]));
    return { r, cum, L: cum[cum.length - 1] };
  }).filter((f) => f.L > 0.01), [routes]);

  const shapes = useMemo(() => {
    const count = (f) => Math.max(1, Math.round((f.L * f.r.st.flowDensity) / SPACING));
    let total = 0;
    for (const f of flows) total += count(f) * (f.r.c.flow === 'both' ? 2 : 1);
    const stretch = Math.max(1, total / MAX_BLOBS);   // very large diagrams get sparser streams instead of slower frames
    const byShape = new Map();
    flows.forEach((f, fi) => {
      const n = Math.max(1, Math.round(count(f) / stretch));
      const dirs = f.r.c.flow === 'both' ? [1, -1] : [1];
      const list = byShape.get(f.r.st.flowShape) ?? byShape.set(f.r.st.flowShape, []).get(f.r.st.flowShape);
      for (const dir of dirs) for (let i = 0; i < n; i++) list.push({ fi, dir, i, n, lane: f.r.c.flow === 'both' ? dir * LANE * Math.max(1, f.r.st.flowSize) : 0 });
    });
    return [...byShape];
  }, [flows]);

  return <>{shapes.map(([shape, blobs]) => <FlowShape key={shape} shape={shape} blobs={blobs} flows={flows} />)}</>;
}

function FlowShape({ shape, blobs, flows }) {
  const mesh = useRef();
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    blobs.forEach((b, k) => {
      const { st } = flows[b.fi].r;
      m.setColorAt(k, c.set(b.dir > 0 ? st.flowColor : st.flowColor2));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blobs, flows]);

  const o = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const heading = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let k = 0; k < blobs.length; k++) {
      const b = blobs[k], f = flows[b.fi], { st } = f.r;
      const u = (b.i / b.n + (t * SPEED * st.flowSpeed) / f.L) % 1;
      const s = (b.dir > 0 ? u : 1 - u) * f.L;
      let j = 1;
      while (j < f.cum.length - 1 && f.cum[j] < s) j++;
      const p = f.r.pts[j - 1], q = f.r.pts[j], seg = f.cum[j] - f.cum[j - 1] || 1, w = (s - f.cum[j - 1]) / seg;
      tmp.lerpVectors(p, q, w);
      if (b.lane) {   // sideways offset so the two directions travel in separate lanes
        const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
        tmp.x += (-dz / len) * b.lane; tmp.z += (dx / len) * b.lane;
      }
      o.position.copy(tmp);
      if (shape !== 'sphere') {
        heading.copy(q).sub(p).multiplyScalar(b.dir);
        o.quaternion.setFromUnitVectors(UP, heading.lengthSq() > 1e-8 ? heading.normalize() : UP);
      }
      o.scale.setScalar(Math.min(1, u * 10, (1 - u) * 10) * st.flowSize);   // ease in/out at the ends
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh key={blobs.length} ref={mesh} args={[FLOW_GEOMETRY[shape] ?? FLOW_GEOMETRY.sphere, flowMaterial, blobs.length]} frustumCulled={false} raycast={() => null} />;
}
