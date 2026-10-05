import React, { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { api } from './api';
import { Link, navigate } from './App';
import { EMPTY, parseDiagram } from './model';

export function Home() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const file = useRef();

  const refresh = () => api.list().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const create = async (name = 'Untitled diagram', data = EMPTY()) => {
    try { navigate(`/d/${(await api.create(name, data)).id}`); } catch (e) { setError(e.message); }
  };

  const importFile = async (f) => {
    if (!f) return;
    try {
      const { name, data } = parseDiagram(await f.text());
      await create(name ?? f.name.replace(/\.json$/i, ''), data);
    } catch (e) { setError(`Import failed: ${e.message}`); }
  };

  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}"? Its share links will stop working.`)) return;
    await api.remove(item.id);
    refresh();
  };

  return (
    <main className="home">
      <header>
        <h1><Logo size={40} /> <span>Strata</span></h1>
        <p>3D diagrams with a free camera and labels you can actually read.</p>
        <div className="row">
          <button className="primary" onClick={() => create()}>New diagram</button>
          <button onClick={() => file.current.click()}>Import JSON</button>
          <input ref={file} type="file" accept="application/json,.json" hidden
            onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
        {error && <p className="error">{error}</p>}
      </header>
      <section>
        {items === null ? <p className="muted">Loading…</p>
          : items.length === 0 ? <p className="muted">No diagrams yet. Create your first one.</p>
          : (
            <ul className="list">
              {items.map((it) => (
                <li key={it.id}>
                  <Link to={`/d/${it.id}`}><strong>{it.name}</strong>
                    <span className="muted">{new Date(it.updatedAt).toLocaleString()}</span></Link>
                  <button className="ghost danger" onClick={() => remove(it)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}
