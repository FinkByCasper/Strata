import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { BASIC_SHAPES, DEVICE_SHAPES, PALETTE, freeSpot, shapeName } from './model';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Fit, Reset, RotL, RotR } from './menuIcons';

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

const tile = (on) => cn(
  'flex flex-col items-center gap-1 rounded-md border bg-card px-1 py-1.5 text-[10px] leading-none text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on && 'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
);

export function ShapePicker({ value, onPick }) {
  const group = (title, list) => (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</div>
      <div className="grid grid-cols-3 gap-1">
        {list.map((sh) => (
          <button key={sh} className={tile(value === sh)} onClick={() => onPick(sh)} title={shapeName(sh)} aria-pressed={value === sh}>
            <ShapeIcon shape={sh} /><span className="max-w-full truncate">{shapeName(sh)}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return <div className="flex flex-col gap-3">{group('Devices', DEVICE_SHAPES)}{group('Basic shapes', BASIC_SHAPES)}</div>;
}

export function Swatches({ value, onPick, custom = true }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PALETTE.map((c) => (
        <button key={c} aria-label={c} onClick={() => onPick(c)} style={{ background: c }}
          className={cn('size-6 rounded-full border-2 border-card shadow-[0_0_0_1px_var(--border)] outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50', value === c && 'shadow-[0_0_0_2px_var(--foreground)]')} />
      ))}
      {custom && (
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#4f8cff'} onChange={(e) => onPick(e.target.value)} aria-label="Custom colour"
          className="size-6 cursor-pointer rounded-full border-2 border-card bg-transparent p-0 shadow-[0_0_0_1px_var(--border)] [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0" />
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
  const item = 'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:bg-accent [&_svg]:text-muted-foreground';

  return (
    <div ref={ref} role="menu" onContextMenu={(e) => e.preventDefault()}
      style={{ left: (pos ?? menu).x, top: (pos ?? menu).y, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-[250] flex min-w-[13rem] flex-col gap-0.5 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95">
      <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Add here</div>
      <button role="menuitem" className={item} onClick={done(() => st.addNodeAt('box', where))}><ShapeIcon shape="box" /> Node</button>
      <button role="menuitem" className={item} onClick={done(() => st.addZoneAt(where))}><ZoneIcon /> Zone</button>
      <Separator className="my-1" />
      <div className="grid grid-cols-4 gap-1">
        {[['rotL', <RotL key="a" />, 'Rotate left'], ['rotR', <RotR key="b" />, 'Rotate right'], ['fit', <Fit key="c" />, 'Fit'], ['reset', <Reset key="d" />, 'Reset']].map(([k, icon, label]) => (
          <button key={k} role="menuitem" title={label} aria-label={label} onClick={done(() => st.setView(k))}
            className="grid h-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent">{icon}</button>
        ))}
      </div>
    </div>
  );
}
