import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Link } from './App';
import { Scene } from './Scene';
import { useStore } from './store';
import { ICONS, PALETTE, ROUTES, SHAPES, parseDiagram } from './model';
import { RichText } from './richtext';
import { ContextMenu, ShapePicker, Swatches } from './Menu';

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};
const slug = (s) => (s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';

export function ViewButtons() {
  const setView = useStore((s) => s.setView);
  return (
    <div className="group" title="Camera">
      {[['iso', 'Free'], ['front', 'Front'], ['top', 'Top'], ['right', 'Side'], ['fit', 'Fit']].map(([k, l]) => (
        <button key={k} onClick={() => setView(k)}>{l}</button>
      ))}
    </div>
  );
}

// Field editors that edit the current selection. `readOnly` shows just the rich-text details.
export function Details({ readOnly }) {
  const sel = useStore((s) => s.selection);
  const data = useStore((s) => s.data);
  if (!sel) return null;
  const node = sel.type === 'node' && data.nodes.find((n) => n.id === sel.id);
  if (readOnly) {
    if (!node) return null;
    return (
      <aside className="panel">
        <h3>{node.label}</h3>
        {node.description ? <RichText text={node.description} /> : <p className="muted">No description.</p>}
      </aside>
    );
  }
  return <Inspector sel={sel} />;
}

function Inspector({ sel }) {
  const s = useStore();
  const { data } = s;
  const fileRef = useRef();
  const [iconError, setIconError] = useState('');

  const num = (arr, i, set) => (
    <input type="number" step="1" value={arr[i]} onChange={(e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) set(arr.map((x, j) => (j === i ? v : x)));
    }} />
  );

  const uploadIcon = (f, id) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setIconError('Use a PNG, JPEG, WebP or GIF.');
    if (f.size > 150_000) return setIconError('Icon must be under 150 KB.');
    setIconError('');
    const r = new FileReader();
    r.onload = () => s.updateNode(id, { icon: r.result });
    r.readAsDataURL(f);
  };

  if (sel.type === 'node') {
    const n = data.nodes.find((x) => x.id === sel.id);
    if (!n) return null;
    return (
      <aside className="panel">
        <h3>Node</h3>
        <label>Label<input value={n.label} onChange={(e) => s.updateNode(n.id, { label: e.target.value })} /></label>
        <label>Description <span className="muted">(**bold**, *italic*, `code`, - lists)</span>
          <textarea rows={5} value={n.description} onChange={(e) => s.updateNode(n.id, { description: e.target.value })} /></label>
        <div className="field">Model<ShapePicker value={n.shape} onPick={(shape) => s.updateNode(n.id, { shape })} /></div>
        <div className="field">Colour<Swatches value={n.color} onPick={(color) => s.updateNode(n.id, { color })} /></div>
        <div className="field">Icon</div>
        <div className="icons">
          <button className={!n.icon ? 'on' : ''} onClick={() => s.updateNode(n.id, { icon: null })}>∅</button>
          {ICONS.map((i) => <button key={i} className={n.icon === i ? 'on' : ''} onClick={() => s.updateNode(n.id, { icon: i })}>{i}</button>)}
          <button onClick={() => fileRef.current.click()} title="Upload your own icon">⤴</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={(e) => { uploadIcon(e.target.files[0], n.id); e.target.value = ''; }} />
        </div>
        {iconError && <p className="error">{iconError}</p>}
        <div className="xyz">
          {['X', 'Y', 'Z'].map((a, i) => <label key={a}>{a}{num(n.position, i, (p) => s.updateNode(n.id, { position: p }))}</label>)}
        </div>
        <button className="danger" onClick={s.removeSelection}>Delete node</button>
      </aside>
    );
  }

  if (sel.type === 'connector') {
    const c = data.connectors.find((x) => x.id === sel.id);
    if (!c) return null;
    return (
      <aside className="panel">
        <h3>Connector</h3>
        <label>Label<input value={c.label} onChange={(e) => s.updateConnector(c.id, { label: e.target.value })} /></label>
        <label>Routing
          <select value={c.route} onChange={(e) => s.updateConnector(c.id, { route: e.target.value })}>
            {ROUTES.map((x) => <option key={x}>{x}</option>)}
          </select></label>
        <label>Line
          <select value={c.line} onChange={(e) => s.updateConnector(c.id, { line: e.target.value })}>
            <option>solid</option><option>dashed</option>
          </select></label>
        <div className="field">Colour<Swatches value={c.color || '#475569'} onPick={(color) => s.updateConnector(c.id, { color })} /></div>
        <label className="check"><input type="checkbox" checked={c.arrow} onChange={(e) => s.updateConnector(c.id, { arrow: e.target.checked })} /> Arrow head</label>
        <button onClick={() => s.updateConnector(c.id, { from: c.to, to: c.from })}>Reverse direction</button>
        <button className="danger" onClick={s.removeSelection}>Delete connector</button>
      </aside>
    );
  }

  const z = data.zones.find((x) => x.id === sel.id);
  if (!z) return null;
  return (
    <aside className="panel">
      <h3>Zone</h3>
      <label>Label<input value={z.label} onChange={(e) => s.updateZone(z.id, { label: e.target.value })} /></label>
      <div className="field">Colour<Swatches value={z.color} onPick={(color) => s.updateZone(z.id, { color })} /></div>
      <p className="muted">Centre</p>
      <div className="xyz">{['X', 'Y', 'Z'].map((a, i) => <label key={a}>{a}{num(z.position, i, (p) => s.updateZone(z.id, { position: p }))}</label>)}</div>
      <p className="muted">Size</p>
      <div className="xyz">{['W', 'H', 'D'].map((a, i) => <label key={a}>{a}{num(z.size, i, (p) => s.updateZone(z.id, { size: p.map((v) => Math.max(1, v)) }))}</label>)}</div>
      <button className="danger" onClick={s.removeSelection}>Delete zone</button>
    </aside>
  );
}

function ShareDialog({ id, viewToken, onClose, onRotate }) {
  const origin = window.location.origin;
  const link = `${origin}/v/${viewToken}`;
  const embed = `<iframe src="${origin}/embed/${viewToken}" width="800" height="500" style="border:0" allowfullscreen></iframe>`;
  const copy = (t) => navigator.clipboard?.writeText(t);
  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Share (view-only)</h3>
        <label>Link<div className="row"><input readOnly value={link} onFocus={(e) => e.target.select()} /><button onClick={() => copy(link)}>Copy</button></div></label>
        <label>Embed<div className="row"><input readOnly value={embed} onFocus={(e) => e.target.select()} /><button onClick={() => copy(embed)}>Copy</button></div></label>
        <p className="muted">Anyone with the link can view but not edit. Regenerate it to revoke the old link and embeds.</p>
        <div className="row end">
          <button className="danger" onClick={() => confirm('Revoke the current link and embeds?') && onRotate(id)}>Regenerate link</button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function Editor({ id }) {
  const s = useStore();
  const [meta, setMeta] = useState(null); // { viewToken }
  const [status, setStatus] = useState('loading'); // loading | saved | saving | error | missing
  const [sharing, setSharing] = useState(false);
  const importRef = useRef();

  useEffect(() => {
    api.get(id)
      .then((d) => { useStore.getState().load(d.name, d.data, false); setMeta({ viewToken: d.viewToken }); setStatus('saved'); })
      .catch(() => setStatus('missing'));
  }, [id]);

  // Debounced autosave whenever the document revision changes.
  useEffect(() => {
    if (s.rev === 0 || status === 'loading' || status === 'missing') return;
    setStatus('saving');
    const t = setTimeout(() => {
      const { name, data } = useStore.getState();
      api.save(id, name || 'Untitled diagram', data).then(() => setStatus('saved')).catch(() => setStatus('error'));
    }, 800);
    return () => clearTimeout(t);
  }, [s.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e) => { if (useStore.getState().rev && status !== 'saved') e.preventDefault(); };
    const key = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') useStore.getState().removeSelection();
      if (e.key === 'Escape') { useStore.getState().setMode('select'); useStore.getState().select(null); }
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', key); };
  }, [status]);

  if (status === 'missing') return <div className="center"><h2>Diagram not found</h2><Link to="/">Back to diagrams</Link></div>;
  if (status === 'loading') return <div className="center muted">Loading…</div>;

  const exportJson = () => download(`${slug(s.name)}.strata.json`, JSON.stringify({ name: s.name, data: s.data }, null, 2), 'application/json');
  const exportPng = () => {
    const c = document.querySelector('canvas');
    // Only the WebGL layer is captured; DOM labels are not part of the image.
    c?.toBlob((b) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `${slug(s.name)}.png` }); a.click(); });
  };
  const importJson = async (f) => {
    if (!f) return;
    try {
      const { name, data } = parseDiagram(await f.text());
      if (confirm('Replace the current diagram with the imported one?')) { s.replaceData(name, data); s.setView('fit'); }
    } catch (e) { alert(`Import failed: ${e.message}`); }
  };

  const hint = s.mode === 'connect'
    ? (s.connectFrom ? 'Now click the target node' : 'Click the source node, then the target node')
    : 'Right-click to add or edit · drag a node to move it (Shift+drag for height) · drag empty space to orbit · right-drag to pan';

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo-link" title="All diagrams"><span className="logo" /></Link>
        <input className="title" value={s.name} onChange={(e) => s.setName(e.target.value)} aria-label="Diagram name" />
        <span className={`status ${status}`}>{{ saved: 'Saved', saving: 'Saving…', error: 'Save failed' }[status]}</span>
        <span className="spacer" />
        <div className="group">
          <button className={s.mode === 'select' ? 'on' : ''} onClick={() => s.setMode('select')}>Select</button>
          <button className={s.mode === 'connect' ? 'on' : ''} onClick={() => s.setMode('connect')}>Connect</button>
        </div>
        <div className="group" title="Add">
          {SHAPES.map((sh) => <button key={sh} onClick={() => s.addNode(sh)}>+ {sh}</button>)}
          <button onClick={s.addZone}>+ zone</button>
        </div>
        <label className="check snap"><input type="checkbox" checked={s.snap} onChange={(e) => s.setSnap(e.target.checked)} /> Snap</label>
        <ViewButtons />
        <div className="group">
          <button onClick={exportJson}>JSON</button>
          <button onClick={exportPng}>PNG</button>
          <button onClick={() => importRef.current.click()}>Import</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importJson(e.target.files[0]); e.target.value = ''; }} />
        </div>
        <button className="primary" onClick={() => setSharing(true)}>Share</button>
      </header>
      <div className="stage">
        <Scene />
        <Details />
        <ContextMenu />
        <div className="hint">{hint}</div>
      </div>
      {sharing && meta && (
        <ShareDialog id={id} viewToken={meta.viewToken} onClose={() => setSharing(false)}
          onRotate={async (i) => setMeta({ viewToken: (await api.rotate(i)).viewToken })} />
      )}
    </div>
  );
}
