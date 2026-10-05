import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { PALETTE, ROUTES, SHAPES, freeSpot } from './model';

export function ShapeIcon({ shape }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {shape === 'box' && <g {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></g>}
      {shape === 'cylinder' && <g {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></g>}
      {shape === 'sphere' && <g {...p}><circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="8.5" ry="3" /></g>}
      {shape === 'slab' && <g {...p}><path d="M12 8l9 4-9 4-9-4z" /><path d="M3 12v3l9 4 9-4v-3" /></g>}
    </svg>
  );
}

export function ShapePicker({ value, onPick }) {
  return (
    <div className="shapes">
      {SHAPES.map((sh) => (
        <button key={sh} className={value === sh ? 'on' : ''} onClick={() => onPick(sh)} title={sh}>
          <ShapeIcon shape={sh} /><span>{sh}</span>
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, onPick, custom = true }) {
  return (
    <div className="swatches">
      {PALETTE.map((c) => (
        <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} aria-label={c} onClick={() => onPick(c)} />
      ))}
      {custom && (
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#4f8cff'}
          onChange={(e) => onPick(e.target.value)} aria-label="Custom colour" />
      )}
    </div>
  );
}

// Right-click menu. Empty space adds things at the clicked grid cell; objects get quick edits.
// Anything added/selected also opens the side panel, which has the full model/colour controls.
export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const data = useStore((s) => s.data);
  const ref = useRef();
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!menu) return;
    const st = useStore.getState();
    const close = () => st.closeMenu();
    const away = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', close); window.removeEventListener('blur', close);
    };
  }, [menu]);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  if (!menu) return null;
  const st = useStore.getState();
  const done = (fn) => () => { fn(); st.closeMenu(); };
  const t = menu.target;
  const node = t?.type === 'node' && data.nodes.find((n) => n.id === t.id);
  const zone = t?.type === 'zone' && data.zones.find((z) => z.id === t.id);
  const conn = t?.type === 'connector' && data.connectors.find((c) => c.id === t.id);
  const where = menu.world ?? freeSpot(data.nodes);

  let body;
  if (node) {
    body = (<>
      <h4>Node · {node.label || 'Untitled'}</h4>
      <ShapePicker value={node.shape} onPick={(shape) => st.updateNode(node.id, { shape })} />
      <Swatches value={node.color} custom={false} onPick={(color) => st.updateNode(node.id, { color })} />
      <hr />
      <button className="item" onClick={done(() => st.startConnectFrom(node.id))}>Connect from here…</button>
      <button className="item" onClick={done(st.duplicateSelection)}>Duplicate</button>
      <button className="item danger" onClick={done(st.removeSelection)}>Delete</button>
    </>);
  } else if (zone) {
    body = (<>
      <h4>Zone · {zone.label}</h4>
      <Swatches value={zone.color} custom={false} onPick={(color) => st.updateZone(zone.id, { color })} />
      <hr />
      <button className="item" onClick={done(st.duplicateSelection)}>Duplicate</button>
      <button className="item danger" onClick={done(st.removeSelection)}>Delete</button>
    </>);
  } else if (conn) {
    body = (<>
      <h4>Connector</h4>
      <div className="seg">{ROUTES.map((r) => (
        <button key={r} className={conn.route === r ? 'on' : ''} onClick={() => st.updateConnector(conn.id, { route: r })}>{r}</button>
      ))}</div>
      <button className="item" onClick={() => st.updateConnector(conn.id, { line: conn.line === 'dashed' ? 'solid' : 'dashed' })}>
        {conn.line === 'dashed' ? 'Make solid' : 'Make dashed'}</button>
      <button className="item" onClick={() => st.updateConnector(conn.id, { arrow: !conn.arrow })}>{conn.arrow ? 'Hide arrow' : 'Show arrow'}</button>
      <button className="item" onClick={done(() => st.updateConnector(conn.id, { from: conn.to, to: conn.from }))}>Reverse direction</button>
      <hr />
      <button className="item danger" onClick={done(st.removeSelection)}>Delete</button>
    </>);
  } else {
    body = (<>
      <h4>Add here</h4>
      <div className="shapes">
        {SHAPES.map((sh) => (
          <button key={sh} onClick={done(() => st.addNodeAt(sh, where))} title={`Add ${sh}`}><ShapeIcon shape={sh} /><span>{sh}</span></button>
        ))}
      </div>
      <button className="item" onClick={done(() => st.addZoneAt(where))}>Add zone</button>
      <hr />
      <button className="item" onClick={done(() => st.setMode(st.mode === 'connect' ? 'select' : 'connect'))}>
        {st.mode === 'connect' ? 'Leave connect mode' : 'Connect mode'}</button>
      <div className="seg">
        {[['iso', 'Free'], ['front', 'Front'], ['top', 'Top'], ['right', 'Side'], ['fit', 'Fit']].map(([k, l]) => (
          <button key={k} onClick={done(() => st.setView(k))}>{l}</button>
        ))}
      </div>
    </>);
  }

  return (
    <div ref={ref} className="ctx" style={{ left: (pos ?? menu).x, top: (pos ?? menu).y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}>
      {body}
    </div>
  );
}
