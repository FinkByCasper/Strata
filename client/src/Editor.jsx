import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Link } from './App';
import { Scene } from './Scene';
import { useStore } from './store';
import { ICONS, LABEL_EDGES, ROUTES, ROUTE_NAMES, parseDiagram } from './model';
import { RichText } from './richtext';
import { ContextMenu, ShapePicker, Swatches } from './Menu';
import { Topbar } from './Topbar';

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};
const slug = (s) => (s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';

export { CameraTools as ViewButtons } from './Topbar';

// Field editors that edit the current selection. `readOnly` shows just the rich-text details.
const nodeName = (data, id) => data.nodes.find((n) => n.id === id)?.label || 'Untitled';

export function Details({ readOnly }) {
  const sel = useStore((s) => s.selection);
  const data = useStore((s) => s.data);
  if (!sel) return null;
  const node = sel.type === 'node' && data.nodes.find((n) => n.id === sel.id);
  const conn = sel.type === 'connector' && data.connectors.find((c) => c.id === sel.id);
  if (readOnly) {
    if (conn) {
      return (
        <aside className="panel">
          <h3>{conn.label || 'Connection'}</h3>
          <p className="muted route-names">{nodeName(data, conn.from)} → {nodeName(data, conn.to)}{conn.subtitle ? ` · ${conn.subtitle}` : ''}</p>
          {conn.description ? <RichText text={conn.description} /> : <p className="muted">No description.</p>}
        </aside>
      );
    }
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

// A freshly created node/zone focuses (and selects) its label so you can just start typing the name.
function LabelInput({ id, value, onChange }) {
  const ref = useRef();
  useEffect(() => {
    if (useStore.getState().fresh !== id) return;
    ref.current?.focus(); ref.current?.select();
    useStore.setState({ fresh: null });
  }, [id]);
  return <input ref={ref} value={value} onChange={onChange} />;
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
        <label>Label<LabelInput id={n.id} value={n.label} onChange={(e) => s.updateNode(n.id, { label: e.target.value })} /></label>
        <label>Subtitle <span className="muted">(second line on the label, e.g. an IP)</span>
          <input value={n.subtitle ?? ''} onChange={(e) => s.updateNode(n.id, { subtitle: e.target.value })} /></label>
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
        <div className="xz">
          {[['X', 0], ['Z', 2]].map(([a, i]) => <label key={a}>{a}{num(n.position, i, (p) => s.updateNode(n.id, { position: p }))}</label>)}
        </div>
        <div className="row">
          <button onClick={() => s.startConnectFrom(n.id)}>Connect from here…</button>
          <button onClick={s.duplicateSelection}>Duplicate</button>
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
        <p className="muted route-names">{nodeName(data, c.from)} → {nodeName(data, c.to)}</p>
        <label>Label<input value={c.label} onChange={(e) => s.updateConnector(c.id, { label: e.target.value })} /></label>
        <label>Subtitle <span className="muted">(second line, e.g. port and protocol)</span>
          <input value={c.subtitle ?? ''} placeholder="TCP 5432 · TLS" onChange={(e) => s.updateConnector(c.id, { subtitle: e.target.value })} /></label>
        <label>Description <span className="muted">(**bold**, *italic*, `code`, - lists)</span>
          <textarea rows={4} value={c.description ?? ''} onChange={(e) => s.updateConnector(c.id, { description: e.target.value })} /></label>
        <label>Routing
          <select value={c.route} onChange={(e) => s.updateConnector(c.id, { route: e.target.value })}>
            {ROUTES.map((x) => <option key={x} value={x}>{ROUTE_NAMES[x] ?? x}</option>)}
          </select></label>
        <label>Line
          <select value={c.line} onChange={(e) => s.updateConnector(c.id, { line: e.target.value })}>
            <option>solid</option><option>dashed</option>
          </select></label>
        <div className="field">Colour<Swatches value={c.color || '#475569'} onPick={(color) => s.updateConnector(c.id, { color })} /></div>
        <div className="field">Data flow
          <div className="seg">
            {[['none', 'Off'], ['forward', 'One way'], ['both', 'Both ways']].map(([m, l]) => (
              <button key={m} className={(c.flow ?? 'none') === m ? 'on' : ''} onClick={() => s.updateConnector(c.id, { flow: m })}>{l}</button>
            ))}
          </div>
          <span className="muted">{(c.flow ?? 'none') === 'none' ? 'Small dots travel along the line in the arrow\'s direction.' : (c.flow === 'both' ? 'Line colour goes forward; the return colour comes back in its own lane.' : 'Dots travel from the source to the target in the line colour.')}</span>
        </div>
        {c.flow === 'both' && <div className="field">Return colour<Swatches value={c.color2 || '#f5a524'} onPick={(color2) => s.updateConnector(c.id, { color2 })} /></div>}
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
      <label>Label<LabelInput id={z.id} value={z.label} onChange={(e) => s.updateZone(z.id, { label: e.target.value })} /></label>
      <div className="field">Colour<Swatches value={z.color} onPick={(color) => s.updateZone(z.id, { color })} /></div>
      <div className="field">Name on the floor
        <div className="seg">
          {[['edge', 'On an edge'], ['center', 'Centre'], ['none', 'None']].map(([m, l]) => (
            <button key={m} className={(z.labelMode ?? 'edge') === m ? 'on' : ''} onClick={() => s.updateZone(z.id, { labelMode: m })}>{l}</button>
          ))}
        </div>
        {(z.labelMode ?? 'edge') === 'edge' && (
          <div className="edges">
            {LABEL_EDGES.map((ed) => (
              <button key={ed} className={(z.labelEdge ?? 'back') === ed ? 'on' : ''} onClick={() => s.updateZone(z.id, { labelEdge: ed })}>{ed}</button>
            ))}
          </div>
        )}
      </div>
      <p className="muted">Centre</p>
      <div className="xz">{[['X', 0], ['Z', 2]].map(([a, i]) => <label key={a}>{a}{num(z.position, i, (p) => s.updateZone(z.id, { position: p }))}</label>)}</div>
      <p className="muted">Size</p>
      <div className="xz">{[['Width', 0], ['Depth', 2]].map(([a, i]) => <label key={a}>{a}{num(z.size, i, (p) => s.updateZone(z.id, { size: [Math.max(1, p[0]), 0, Math.max(1, p[2])] }))}</label>)}</div>
      <button onClick={s.duplicateSelection}>Duplicate</button>
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
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // let text fields keep their own undo
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') { e.preventDefault(); e.shiftKey ? useStore.getState().redo() : useStore.getState().undo(); return; }
        if (key === 'y') { e.preventDefault(); useStore.getState().redo(); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') useStore.getState().removeSelection();
      if (e.key === 'Escape') { useStore.getState().setMode('select'); useStore.getState().select(null); }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === 'v') st.setMode('select');
      else if (k === 'c') st.setMode('connect');
      else if (k === 'g') st.setSnap(!st.snap);
      else if (k === 'q') st.setView('rotL');
      else if (k === 'e') st.setView('rotR');
      else if (k === 'f') st.setView('fit');
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
    : 'Right-click to add · click to edit · hold a node or zone to pick it up · drag empty space to rotate around · right-drag to pan · Q/E rotate 90°';

  return (
    <div className="app">
      <Topbar status={status} onShare={() => setSharing(true)} onExportJson={exportJson} onExportPng={exportPng}
        onImport={() => importRef.current.click()} />
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importJson(e.target.files[0]); e.target.value = ''; }} />
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
