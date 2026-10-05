import React, { useEffect, useState } from 'react';
import { api } from './api';
import { Scene } from './Scene';
import { useStore } from './store';
import { Details } from './Editor';
import { CameraTools } from './Topbar';

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
        <div className="tb-left"><span className="logo" /><strong className="title-static">{state.name}</strong><span className="badge">View only</span></div>
        <div className="tb-right">
          <CameraTools />
          {embed && <a className="pill" href={`/v/${token}`} target="_blank" rel="noreferrer">Open ↗</a>}
        </div>
      </header>
      <div className="stage">
        <Scene />
        <Details readOnly />
        <div className="hint">Drag to rotate · right-drag to pan · scroll to zoom · click a node for details</div>
      </div>
    </div>
  );
}
