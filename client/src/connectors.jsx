import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { LineMaterial } from 'three-stdlib';
import { LineSegments2 } from 'three-stdlib';
import { LineSegmentsGeometry } from 'three-stdlib';
import { useStore } from './store';
import { polylineMidpoint, routePoints } from './model';
import { UP } from './hold';
import { Label, useLod } from './labels';
import { RichText } from './richtext';
import { useHighlight } from './highlight';

const selectConnector = (id) => useStore.getState().select({ type: 'connector', id });
const FADE = new THREE.Color('#eceef4');   // the floor colour: dimmed lines are mixed towards it

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

// All connector lines are merged into two objects (solid + dashed) with per-segment colours, arrowheads are
// one instanced mesh, and the moving data blobs another, so the number of connectors barely affects draw calls.
export function ConnectorsLayer() {
  const connectors = useStore((s) => s.data.connectors);
  const nodes = useStore((s) => s.data.nodes);
  const selId = useStore((s) => (s.selection?.type === 'connector' ? s.selection.id : null));
  const { size, raycaster } = useThree();
  const lod = useLod();
  const hl = useHighlight();

  const routes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return connectors.flatMap((c) => {
      const a = byId.get(c.from), b = byId.get(c.to);
      return a && b ? [{ c, pts: routePoints(a.position, b.position, c.route) }] : [];
    });
  }, [connectors, nodes]);

  const lines = useMemo(() => {
    const make = (dashed) => {
      const pos = [], col = [], map = [], color = new THREE.Color();
      routes.forEach((r, ri) => {
        if ((r.c.line === 'dashed') !== dashed) return;
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
      const m = new LineMaterial({ linewidth: 2.4, vertexColors: true, dashed, dashSize: 0.25, gapSize: 0.18 });
      const l = new LineSegments2(g, m);
      if (dashed) l.computeLineDistances();
      l.frustumCulled = false;
      l.userData.map = map;
      return l;
    };
    return [make(false), make(true)].filter(Boolean);
  }, [routes, hl]);
  useEffect(() => () => lines.forEach((l) => { l.geometry.dispose(); l.material.dispose(); }), [lines]);
  useEffect(() => { lines.forEach((l) => l.material.resolution.set(size.width, size.height)); }, [lines, size]);

  // arrowheads
  // one entry per arrowhead: at the target end (`arrow`) and/or the source end (`arrowStart`)
  const arrows = useMemo(() => routes.flatMap((r) => [
    ...(r.c.arrow ? [{ r, tip: r.pts[r.pts.length - 1], from: r.pts[r.pts.length - 2] }] : []),
    ...(r.c.arrowStart ? [{ r, tip: r.pts[0], from: r.pts[1] }] : []),
  ]), [routes]);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.13, 0.34, 14), []);
  const coneMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const arrowMesh = useRef();
  useLayoutEffect(() => {
    const m = arrowMesh.current;
    if (!m) return;
    const o = new THREE.Object3D(), c = new THREE.Color(), d = new THREE.Vector3();
    arrows.forEach(({ r, tip, from }, i) => {
      d.copy(tip).sub(from).normalize();
      o.position.copy(tip).addScaledVector(d, -0.17);
      o.quaternion.setFromUnitVectors(UP, d);
      o.scale.setScalar(r.c.id === selId ? 1.25 : 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(r.c.color || '#475569');
      if (hl && !hl.connectors.has(r.c.id)) c.lerp(FADE, 0.85);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  });

  const selRoute = routes.find((r) => r.c.id === selId);
  const flowRoutes = useMemo(() => (hl ? routes.filter((r) => hl.connectors.has(r.c.id)) : routes), [routes, hl]);   // faded lines carry no moving dots
  return (
    <>
      {selRoute && <Line points={selRoute.pts} color="#4f8cff" lineWidth={7} transparent opacity={0.35} raycast={() => null} />}
      {lines.map((l, i) => (
        <primitive
          key={i} object={l}
          onClick={(e) => {
            e.stopPropagation();
            const id = pickConnector(raycaster, [...lines, arrowMesh.current].filter(Boolean), (hit) => (hit.object.userData.map ? routes[hit.object.userData.map[hit.faceIndex]]?.c.id : hit.object === arrowMesh.current ? arrows[hit.instanceId]?.r.c.id : null), selId);
            if (id) selectConnector(id);
          }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}
        />
      ))}
      {arrows.length > 0 && (
        <instancedMesh
          key={arrows.length} ref={arrowMesh} args={[coneGeo, coneMat, arrows.length]} frustumCulled={false}
          onClick={(e) => {
            e.stopPropagation();
            const id = pickConnector(raycaster, [...lines, arrowMesh.current].filter(Boolean), (hit) => (hit.object.userData.map ? routes[hit.object.userData.map[hit.faceIndex]]?.c.id : hit.object === arrowMesh.current ? arrows[hit.instanceId]?.r.c.id : null), selId);
            if (id) selectConnector(id);
          }}
        />
      )}
      {lod !== 'off' && routes.filter((r) => (r.c.label || r.c.subtitle || r.c.id === selId) && (!hl || hl.connectors.has(r.c.id))).map((r) => {
        const selected = r.c.id === selId, full = lod === 'full' || selected;
        return (
          <Label key={r.c.id} position={polylineMidpoint(r.pts)} className={`line-label ${selected ? 'selected' : ''} ${full ? '' : 'small'}`}
            onClick={() => selectConnector(r.c.id)} priority={selected ? 3 : 1.2}>
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

// ---------------------------------------------------------------------------------------------
// Data-flow blobs: small spheres travelling along a connector in the arrow's direction, in the line's colour.
// "Both ways" (multiplex) adds a second stream in the return colour going the other way, in its own lane.
// ---------------------------------------------------------------------------------------------
const SPACING = 2.3, SPEED = 1.7, RADIUS = 0.11, LANE = 0.1, MAX_BLOBS = 2000;
const blobGeo = new THREE.SphereGeometry(RADIUS, 14, 10);

function FlowBlobs({ routes }) {
  const flows = useMemo(() => routes.filter((r) => r.c.flow === 'forward' || r.c.flow === 'both').map((r) => {
    const cum = [0];
    for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + r.pts[i].distanceTo(r.pts[i - 1]));
    return { r, cum, L: cum[cum.length - 1] };
  }).filter((f) => f.L > 0.01), [routes]);

  const blobs = useMemo(() => {
    let total = 0;
    for (const f of flows) total += Math.max(1, Math.round(f.L / SPACING)) * (f.r.c.flow === 'both' ? 2 : 1);
    const stretch = Math.max(1, total / MAX_BLOBS);   // very large diagrams get sparser streams instead of slower frames
    const list = [];
    flows.forEach((f, fi) => {
      const n = Math.max(1, Math.round(f.L / (SPACING * stretch)));
      const dirs = f.r.c.flow === 'both' ? [1, -1] : [1];
      for (const dir of dirs) for (let i = 0; i < n; i++) list.push({ fi, dir, i, n, lane: f.r.c.flow === 'both' ? dir * LANE : 0 });
    });
    return list;
  }, [flows]);

  const mesh = useRef();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    blobs.forEach((b, k) => {
      const col = flows[b.fi].r.c;
      m.setColorAt(k, c.set(b.dir > 0 ? col.color || '#475569' : col.color2 || '#f5a524'));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blobs, flows]);

  const o = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let k = 0; k < blobs.length; k++) {
      const b = blobs[k], f = flows[b.fi];
      const u = (b.i / b.n + (t * SPEED) / f.L) % 1;
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
      o.scale.setScalar(Math.min(1, u * 10, (1 - u) * 10));   // ease in/out at the ends
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  if (!blobs.length) return null;
  return <instancedMesh key={blobs.length} ref={mesh} args={[blobGeo, mat, blobs.length]} frustumCulled={false} raycast={() => null} />;
}
