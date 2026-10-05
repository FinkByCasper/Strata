import React, { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { Link } from './App';
import { useStore } from './store';

const I = ({ children, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
export const Icons = {
  select: <I><path d="M5 3l14 8-6 2-3 6z" /></I>,
  connect: <I><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="5.5" r="2.5" /><path d="M8 17l8-9" /></I>,
  rotL: <I><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" /></I>,
  rotR: <I><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v4h-4" /></I>,
  fit: <I><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></I>,
  reset: <I><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5" /></I>,
  grid: <I><path d="M4 4h16v16H4zM4 12h16M12 4v16" /></I>,
  undo: <I><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>,
  redo: <I><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></I>,
  chevron: <I size={14}><path d="M6 9l6 6 6-6" /></I>,
};

function Tool({ icon, label, on, onClick, hint, disabled }) {
  return (
    <button className={`tool ${on ? 'on' : ''}`} onClick={onClick} title={hint ? `${label} (${hint})` : label} aria-label={label} aria-pressed={on} disabled={disabled}>
      {icon}
    </button>
  );
}

export function CameraTools() {
  const setView = useStore((s) => s.setView);
  return (
    <div className="tb-group" role="group" aria-label="Camera">
      <Tool icon={Icons.rotL} label="Rotate left 90°" hint="Q" onClick={() => setView('rotL')} />
      <Tool icon={Icons.rotR} label="Rotate right 90°" hint="E" onClick={() => setView('rotR')} />
      <Tool icon={Icons.fit} label="Fit to content" hint="F" onClick={() => setView('fit')} />
      <Tool icon={Icons.reset} label="Reset camera" onClick={() => setView('reset')} />
    </div>
  );
}

function Dropdown({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="dropdown" ref={ref}>
      <button className="pill" onClick={() => setOpen(!open)} aria-expanded={open}>{label}{Icons.chevron}</button>
      {open && <div className="popover" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export function Topbar({ status, onShare, onExportJson, onExportPng, onImport }) {
  const name = useStore((s) => s.name);
  const mode = useStore((s) => s.mode);
  const snap = useStore((s) => s.snap);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const st = useStore.getState();

  return (
    <header className="topbar">
      <div className="tb-left">
        <Link to="/" className="logo-link" title="All diagrams"><Logo size={28} /></Link>
        <input className="title" value={name} onChange={(e) => st.setName(e.target.value)} aria-label="Diagram name" placeholder="Untitled diagram" />
        <span className={`status ${status}`} role="status"><i />{{ saved: 'Saved', saving: 'Saving…', error: 'Save failed' }[status]}</span>
      </div>

      <div className="tb-center">
        <div className="tb-group" role="group" aria-label="Tool">
          <Tool icon={Icons.select} label="Select" hint="V" on={mode === 'select'} onClick={() => st.setMode('select')} />
          <Tool icon={Icons.connect} label="Connect" hint="C" on={mode === 'connect'} onClick={() => st.setMode('connect')} />
        </div>
        <div className="tb-group" role="group" aria-label="History">
          <Tool icon={Icons.undo} label="Undo" hint="Ctrl+Z" disabled={!canUndo} onClick={() => st.undo()} />
          <Tool icon={Icons.redo} label="Redo" hint="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => st.redo()} />
        </div>
      </div>

      <div className="tb-right">
        <CameraTools />
        <Tool icon={Icons.grid} label="Snap to grid" hint="G" on={snap} onClick={() => st.setSnap(!snap)} />
        <Dropdown label="File">
          <button onClick={onExportJson}>Export JSON</button>
          <button onClick={onExportPng}>Export PNG</button>
          <button onClick={onImport}>Import JSON…</button>
          <hr />
          <Link to="/" className="menu-link">All diagrams</Link>
        </Dropdown>
        <button className="primary pill" onClick={onShare}>Share</button>
      </div>
    </header>
  );
}
