import React, { useEffect, useState } from 'react';
import { api } from './api';
import { Scene } from './Scene';
import { useStore } from './store';
import { ViewButtons, Details } from './Editor';

export function Viewer({ token, embed = false }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    api.shared(token)
      .then((d) => { useStore.getState().load(d.name, d.data, true); setState({ status: 'ready', name: d.name }); })
      .catch(() => setState({ status: 'missing' }));
  }, [token]);

  if (state.status === 'loading') return <div className="center muted">Loading…</div>;
  if (state.status === 'missing') return <div className="center"><h2>Diagram not found</h2><p className="muted">The link may have been revoked.</p></div>;

  return (
    <div className="app viewer">
      <header className="topbar">
        <strong className="title-static">{state.name}</strong>
        <span className="spacer" />
        <ViewButtons />
        {embed && <a className="btn" href={`/v/${token}`} target="_blank" rel="noreferrer">Open ↗</a>}
      </header>
      <div className="stage">
        <Scene />
        <Details readOnly />
        <div className="hint">Drag to orbit · right-drag to pan · scroll to zoom · click a node for details</div>
      </div>
    </div>
  );
}
