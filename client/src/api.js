async function answer(res, path) {
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('strata:signed-out'));
    throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

const req = async (path, opts) => answer(await fetch(path, {
  headers: { 'content-type': 'application/json' }, ...opts,
  body: opts?.body ? JSON.stringify(opts.body) : undefined,
}), path);

export const api = {
  list: () => req('/api/diagrams'),
  get: (id) => req(`/api/diagrams/${id}`),
  create: (name, data) => req('/api/diagrams', { method: 'POST', body: { name, data } }),
  save: (id, name, data) => req(`/api/diagrams/${id}`, { method: 'PUT', body: { name, data } }),
  remove: (id) => req(`/api/diagrams/${id}`, { method: 'DELETE' }),
  rotate: (id) => req(`/api/diagrams/${id}/rotate-view-token`, { method: 'POST' }),
  shared: (token) => req(`/api/shared/${token}`),
  me: () => req('/api/auth/me'),
  login: (email, password) => req('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (email, password, displayName) => req('/api/auth/register', { method: 'POST', body: { email, password, displayName } }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  shares: (id) => req(`/api/diagrams/${id}/shares`),
  share: (id, email, role) => req(`/api/diagrams/${id}/shares`, { method: 'PUT', body: { email, role } }),
  versions: (id) => req(`/api/diagrams/${id}/versions`),
  saveVersion: (id, label) => req(`/api/diagrams/${id}/versions`, { method: 'POST', body: { label } }),
  restoreVersion: (id, versionId) => req(`/api/diagrams/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  deleteVersion: (id, versionId) => req(`/api/diagrams/${id}/versions/${versionId}`, { method: 'DELETE' }),
  models: (id) => req(`/api/diagrams/${id}/models`),
  uploadModel: async (id, file) => {
    const path = `/api/diagrams/${id}/models?name=${encodeURIComponent(file.name)}`;
    return answer(await fetch(path, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }), path);
  },
  deleteModel: (id, modelId) => req(`/api/diagrams/${id}/models/${modelId}`, { method: 'DELETE' }),
  unshare: (id, userId) => req(`/api/diagrams/${id}/shares/${userId}`, { method: 'DELETE' }),
};
