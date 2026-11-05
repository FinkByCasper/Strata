import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FLOOR, clampScale, fit, labelHeight, rotationDegrees } from './modelFit';
import { boxOf, instantiate, rememberHeight, useModel } from './models';

const RAD = Math.PI / 180;

function build(scene, node) {
  const [rx, ry, rz] = rotationDegrees(node);
  const turned = new THREE.Group();
  turned.rotation.set(rx * RAD, ry * RAD, rz * RAD);
  turned.add(instantiate(scene));
  turned.updateMatrixWorld(true);
  const box = boxOf(turned);
  const fitted = box.isEmpty() ? null : fit(box.min.toArray(), box.max.toArray(), clampScale(node.modelScale));
  return fitted && { turned, fitted };
}

// Selected and spotlighted models are drawn with their own copies of the materials, because tinting the shared ones would tint every node using the model.
function useLook(built, glow, dim, color) {
  useEffect(() => {
    if (!built) return undefined;
    const copies = [];
    built.turned.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.original ??= o.material;
      if (!glow && !dim) { o.material = o.userData.original; return; }
      const originals = [].concat(o.userData.original);
      const made = originals.map((m) => {
        const c = m.clone();
        if (dim) { c.transparent = true; c.opacity = Math.min(c.opacity, 0.22); c.depthWrite = false; }
        if (glow && c.emissive) { c.emissive.set(color); c.emissiveIntensity = Math.max(c.emissiveIntensity ?? 0, 0.12); }
        return c;
      });
      copies.push(...made);
      o.material = Array.isArray(o.userData.original) ? made : made[0];
    });
    return () => {
      copies.forEach((c) => c.dispose());
      built.turned.traverse((o) => { if (o.userData.original) o.material = o.userData.original; });
    };
  }, [built, glow, dim, color]);
}

// Picking uses an invisible box instead of the model's triangles, which would make every pointer move cost as much as the model has faces.
function Pick({ size, y }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={size} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function Stand({ error }) {
  return (
    <>
      <mesh position={[0, FLOOR + 0.4, 0]} raycast={() => null}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshBasicMaterial color={error ? '#ef4444' : '#94a3b8'} wireframe />
      </mesh>
      <Pick size={[0.9, 0.9, 0.9]} y={FLOOR + 0.45} />
    </>
  );
}

export function ModelNode({ node, lifted, glow, dim, h }) {
  const entry = useModel(node.modelId);
  const rotationKey = rotationDegrees(node).join(',');
  const built = useMemo(() => (entry.scene ? build(entry.scene, node) : null), [entry.scene, rotationKey, node.modelScale]); // eslint-disable-line react-hooks/exhaustive-deps
  useLook(built, glow, dim, node.color);
  useEffect(() => { if (built) rememberHeight(node, labelHeight(built.fitted)); }, [built, node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { fitted } = built ?? {};
  const handlers = { onPointerDown: (e) => h.onDown(node, e), onPointerMove: h.move, onPointerOver: h.over, onPointerOut: h.out };
  return (
    <group position={[node.position[0], node.position[1] + (lifted ? 0.5 : 0), node.position[2]]} scale={lifted ? 1.1 : 1} {...handlers}>
      {built ? (
        <>
          <group position={fitted.offset} scale={fitted.k}><primitive object={built.turned} /></group>
          <Pick size={fitted.size} y={FLOOR + fitted.size[1] / 2} />
        </>
      ) : <Stand error={entry.status === 'error'} />}
    </group>
  );
}
