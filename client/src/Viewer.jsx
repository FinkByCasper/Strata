import React, { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { api } from './api';
import { Scene } from './Scene';
import { useStore } from './store';
import { Details } from './Editor';
import { CameraTools } from './Topbar';
import { Intro, useIntro, VIEWER_TOUR } from './Intro';

// In an embed the top bar is hidden; it slides in when the pointer goes to the top edge (tap it on touch screens).
function AutoHideBar({ children }) {
  const [open, setOpen] = useState(false);
  const timer = useRef();
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 500); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <div className="embed-hot" onMouseEnter={show} onMouseLeave={hide} onClick={() => setOpen((o) => !o)} />
      <div className={`embed-bar ${open ? 'open' : ''}`} onMouseEnter={show} onMouseLeave={hide}>{children}</div>
    </>
  );
}

export function Viewer({ token, embed = false }) {
  const [state, setState] = useState({ status: 'loading' });
  const intro = useIntro(!embed && state.status === 'ready');

  useEffect(() => {
    api.shared(token)
      .then((d) => { useStore.getState().load(d.name, d.data, true); setState({ status: 'ready', name: d.name }); })
      .catch(() => setState({ status: 'missing' }));
  }, [token]);

  if (state.status === 'loading') return <div className="center muted">Loading…</div>;
  if (state.status === 'missing') return <div className="center"><h2>Diagram not found</h2><p className="muted">The link may have been revoked.</p></div>;

  const bar = (
    <header className="topbar">
      <div className="tb-left"><Logo size={26} /><strong className="title-static">{state.name}</strong></div>
      <div className="tb-center" />
      <div className="tb-right">
        <CameraTools />
        {embed && <a className="pill" href={`/v/${token}`} target="_blank" rel="noreferrer">Open ↗</a>}
      </div>
    </header>
  );

  return (
    <div className="app viewer">
      {embed ? <AutoHideBar>{bar}</AutoHideBar> : bar}
      <div className="stage">
        <Scene />
        <Details readOnly />
        {intro.show && <Intro onDone={intro.dismiss} steps={VIEWER_TOUR} />}
      </div>
    </div>
  );
}
