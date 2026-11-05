const CHUNK = 0x8000;

export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += CHUNK) text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(text);
}

export function fromBase64(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const usedModelIds = (data) => [...new Set(data.nodes.filter((n) => n.shape === 'model' && n.modelId).map((n) => n.modelId))];

// Uploading gives every model a new id in the receiving diagram, so the nodes that use them have to follow.
export function remapModels(data, map) {
  if (!map.size) return data;
  return { ...data, nodes: data.nodes.map((n) => (n.shape === 'model' && map.has(n.modelId) ? { ...n, modelId: map.get(n.modelId) } : n)) };
}

export function cleanBundle(models) {
  if (!Array.isArray(models)) return [];
  return models.filter((m) => m && typeof m.id === 'string' && typeof m.data === 'string').map((m) => ({ id: m.id, name: typeof m.name === 'string' ? m.name : 'model', data: m.data }));
}
