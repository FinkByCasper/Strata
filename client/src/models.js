import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { api } from './api';
import { cleanBundle, fromBase64, remapModels, toBase64, usedModelIds } from './modelBundle';

// base: where this page reads models from (the editing id for the editor, the view token for a shared link); diagramId only exists when editing.
export const useModels = create(() => ({ base: null, diagramId: null, list: [], loaded: 0 }));

export const useModelSource = (base, diagramId) => {
  useEffect(() => {
    useModels.setState({ base, diagramId, list: [] });
    if (diagramId) refreshModels();
    return () => useModels.setState({ base: null, diagramId: null, list: [] });
  }, [base, diagramId]);
};

export const refreshModels = async () => {
  const id = useModels.getState().diagramId;
  if (!id) return;
  try { useModels.setState({ list: await api.models(id) }); } catch { /* the list is only a convenience; nodes load their own models */ }
};

export async function uploadModel(file) {
  const id = useModels.getState().diagramId;
  const model = await api.uploadModel(id, file);
  await refreshModels();
  return model;
}

export async function deleteModel(modelId) {
  await api.deleteModel(useModels.getState().diagramId, modelId);
  await refreshModels();
}

const cache = new Map();

function prepare(scene) {
  const lights = [];
  scene.traverse((o) => {
    if (o.isLight || o.isCamera) lights.push(o);
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.raycast = () => {}; }
  });
  lights.forEach((o) => o.removeFromParent());
  return scene;
}

export function loadModel(base, modelId) {
  const key = `${base}/${modelId}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(key)
      .then((res) => { if (!res.ok) throw new Error(`model ${res.status}`); return res.arrayBuffer(); })
      .then((buffer) => new Promise((ok, fail) => new GLTFLoader().parse(buffer, '', (gltf) => ok(prepare(gltf.scene)), fail)));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return promise;
}

export function useModel(modelId) {
  const base = useModels((s) => s.base);
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    if (!base || !modelId) { setState({ status: 'error' }); return undefined; }
    loadModel(base, modelId).then((scene) => live && setState({ status: 'ready', scene }), () => live && setState({ status: 'error' }));
    return () => { live = false; };
  }, [base, modelId]);
  return state;
}

export const instantiate = (scene) => cloneSkinned(scene);

const heights = new Map();
export const modelLabelHeight = (node) => heights.get(node.id);
export function rememberHeight(node, value) {
  if (heights.get(node.id) === value) return;
  heights.set(node.id, value);
  useModels.setState((s) => ({ loaded: s.loaded + 1 }));
}

// Per-diagram export keeps working as one self-contained file, so the models travel inside it.
export async function bundleFor(data) {
  const { base, list } = useModels.getState();
  const out = [];
  for (const id of usedModelIds(data)) {
    const res = await fetch(`${base}/${id}`);
    if (!res.ok) continue;
    out.push({ id, name: list.find((m) => m.id === id)?.name ?? 'model', data: toBase64(new Uint8Array(await res.arrayBuffer())) });
  }
  return out;
}

export async function restoreBundle(diagramId, bundle, data) {
  const files = cleanBundle(bundle);
  const map = new Map();
  for (const m of files) {
    const type = /\.gltf$/i.test(m.name) ? 'model/gltf+json' : 'model/gltf-binary';
    const uploaded = await api.uploadModel(diagramId, new File([fromBase64(m.data)], m.name, { type }));
    map.set(m.id, uploaded.id);
  }
  return remapModels(data, map);
}

export const boxOf = (object) => new THREE.Box3().setFromObject(object);
