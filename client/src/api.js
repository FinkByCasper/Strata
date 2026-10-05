async function req(path, opts) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' }, ...opts,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  list: () => req('/api/diagrams'),
  get: (id) => req(`/api/diagrams/${id}`),
  create: (name, data) => req('/api/diagrams', { method: 'POST', body: { name, data } }),
  save: (id, name, data) => req(`/api/diagrams/${id}`, { method: 'PUT', body: { name, data } }),
  remove: (id) => req(`/api/diagrams/${id}`, { method: 'DELETE' }),
  rotate: (id) => req(`/api/diagrams/${id}/rotate-view-token`, { method: 'POST' }),
  shared: (token) => req(`/api/shared/${token}`),
};
