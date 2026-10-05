import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { BASIC_SHAPES, DEVICE_SHAPES, PALETTE, freeSpot, shapeName } from './model';

export function ShapeIcon({ shape }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' };
  const glyph = {
    box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
    cylinder: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></>,
    sphere: <><circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="8.5" ry="3" /></>,
    slab: <><path d="M12 8l9 4-9 4-9-4z" /><path d="M3 12v3l9 4 9-4v-3" /></>,
    user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-4 3.2-6.2 7-6.2s7 2.2 7 6.2" /></>,
    server: <><rect x="4" y="3" width="16" height="5" rx="1" /><rect x="4" y="9.5" width="16" height="5" rx="1" /><rect x="4" y="16" width="16" height="5" rx="1" /><path d="M7.5 5.5h.01M7.5 12h.01M7.5 18.5h.01" /></>,
    router: <><rect x="3" y="13" width="18" height="6" rx="1.5" /><path d="M7 13V6M17 13V6M7.5 16h.01M11 16h.01" /></>,
    accesspoint: <><path d="M4.5 10a10 10 0 0 1 15 0M7.5 13a6 6 0 0 1 9 0" /><circle cx="12" cy="17" r="1.4" /></>,
    pc: <><rect x="3" y="4" width="12" height="9" rx="1" /><path d="M6.5 20h5M9 13v7" /><rect x="17.5" y="6" width="3.5" height="14" rx="1" /></>,
    laptop: <><rect x="5" y="5" width="14" height="10" rx="1" /><path d="M2.5 19h19" /></>,
    phone: <><rect x="8" y="3" width="8" height="18" rx="2" /><path d="M11 18h2" /></>,
    database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    switch: <><rect x="3" y="11" width="18" height="7" rx="1.2" /><path d="M6.5 14.5h.01M9.5 14.5h.01M12.5 14.5h.01M15.5 14.5h.01M18 14.5h.01" /></>,
    firewall: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9.3h16M4 14.6h16M10 4v5.3M15 9.3v5.3M9 14.6V20" /></>,
    antenna: <><path d="M12 3v18M7 21l5-15 5 15M9.2 14h5.6M10.4 10h3.2" /></>,
    printer: <><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 9V4h10v5M7 14h10v6H7z" /></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.4 4.4 0 0 0 7 18z" /></>,
    container: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M8 11l4 2 4-2M8 14.2l4 2 4-2" /></>,
    pyramid: <><path d="M12 4l8 14H4z" /><path d="M12 4v14" /></>,
    cache: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><g {...p}>{glyph[shape]}</g></svg>;
}

export const ZoneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 5c4 0 9 2 9 4.5S16 14 12 14 3 12 3 9.5 8 5 12 5z" strokeDasharray="3 2.5" /><path d="M3 9.5V12c0 2.5 5 4.5 9 4.5s9-2 9-4.5V9.5" opacity=".5" />
  </svg>
);

export function ShapePicker({ value, onPick }) {
  const group = (title, list) => (
    <>
      <div className="shapes-title">{title}</div>
      <div className="shapes">
        {list.map((sh) => (
          <button key={sh} className={value === sh ? 'on' : ''} onClick={() => onPick(sh)} title={shapeName(sh)}>
            <ShapeIcon shape={sh} /><span>{shapeName(sh)}</span>
          </button>
        ))}
      </div>
    </>
  );
  return <div className="picker">{group('Devices', DEVICE_SHAPES)}{group('Basic shapes', BASIC_SHAPES)}</div>;
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

// Right-click menu: always "add" (at the clicked grid cell). Editing an object is left-click + side panel.
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
  const where = menu.world ?? freeSpot(data.nodes);
  const body = (<>
    <h4>Add here</h4>
    <button className="item add" onClick={done(() => st.addNodeAt('box', where))}><ShapeIcon shape="box" /> Node</button>
    <button className="item add" onClick={done(() => st.addZoneAt(where))}><ZoneIcon /> Zone</button>
    <hr />
    <div className="seg">
      {[['rotL', '⟲ 90°'], ['rotR', '⟳ 90°'], ['fit', 'Fit'], ['reset', 'Reset']].map(([k, l]) => (
        <button key={k} onClick={done(() => st.setView(k))}>{l}</button>
      ))}
    </div>
  </>);

  return (
    <div ref={ref} className="ctx" style={{ left: (pos ?? menu).x, top: (pos ?? menu).y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}>
      {body}
    </div>
  );
}
