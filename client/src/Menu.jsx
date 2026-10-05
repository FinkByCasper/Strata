import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { PALETTE, SHAPES, freeSpot } from './model';

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

export const ZoneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 5c4 0 9 2 9 4.5S16 14 12 14 3 12 3 9.5 8 5 12 5z" strokeDasharray="3 2.5" /><path d="M3 9.5V12c0 2.5 5 4.5 9 4.5s9-2 9-4.5V9.5" opacity=".5" />
  </svg>
);

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
