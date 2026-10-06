import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { camState } from './hold';
import { useStore } from './store';

const KEY = 'strata.intro.seen';

// First-run tour: one small card at the bottom that shows the next thing to try (animated mouse) and stays on
// each step until you actually do it, then moves on. Finishing or skipping it is remembered in localStorage.
export function useIntro(enabled) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable: just show it */ }
    if (!seen) setShow(true);
  }, [enabled]);
  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  }, []);
  return { show, dismiss, replay: () => setShow(true) };
}

// `watch` says how a step is detected as done.
const STEPS = {
  zoom: { mouse: 'zoom', title: 'Scroll to zoom', text: 'Move the mouse wheel to get closer or further away.', watch: 'zoom' },
  rotate: { mouse: 'rotate', title: 'Drag to rotate', text: 'Hold the left button on empty space and drag sideways. Q and E turn it a quarter.', watch: 'rotate' },
  add: { mouse: 'right', title: 'Right-click to add', text: 'Right-click on the floor and choose Node or Zone.', watch: 'add' },
  select: { mouse: 'click', title: 'Click to select', text: 'Left-click a node, zone or line to see and edit it in the side panel.', watch: 'select' },
  details: { mouse: 'click', title: 'Click to read more', text: 'Left-click a node or line to see its details.', watch: 'select' },
  move: { mouse: 'hold', title: 'Hold to move', text: 'Press and hold a node for half a second, drag it to another square and let go.', watch: 'lift' },
};
export const EDITOR_TOUR = ['zoom', 'rotate', 'add', 'select', 'move'];
export const VIEWER_TOUR = ['zoom', 'rotate', 'details'];

function Mouse({ mode }) {
  return (
    <svg className={`mouse ${mode}`} viewBox="0 0 40 60" width="46" height="69" aria-hidden>
      <rect x="4" y="4" width="32" height="52" rx="16" fill="#fff" stroke="#334155" strokeWidth="2.5" />
      <path className="lbtn" d="M4 24V20a16 16 0 0 1 16-16V24Z" />
      <path className="rbtn" d="M36 24V20A16 16 0 0 0 20 4V24Z" />
      <line x1="20" y1="4" x2="20" y2="24" stroke="#334155" strokeWidth="2" />
      <line x1="4.5" y1="24" x2="35.5" y2="24" stroke="#334155" strokeWidth="2" />
      <rect className="wheel" x="17" y="9" width="6" height="11" rx="3" />
    </svg>
  );
}

function Demo({ mode }) {
  return (
    <div className={`intro-demo ${mode}`}>
      {mode === 'right' && <div className="mini-menu"><i /><i /></div>}
      {mode !== 'right' && <Logo size={52} title="" />}
    </div>
  );
}

// Watches what the user does and calls `done` once the current step's action has happened.
function useStepWatcher(watch, done) {
  const lastInput = useRef(0);
  useEffect(() => {
    const stamp = () => { lastInput.current = performance.now(); };
    const opts = { capture: true, passive: true };
    window.addEventListener('wheel', stamp, opts);
    window.addEventListener('pointerdown', stamp, opts);
    window.addEventListener('keydown', stamp, opts);
    window.addEventListener('pointermove', (e) => e.buttons && stamp(), opts);
    return () => {
      window.removeEventListener('wheel', stamp, true); window.removeEventListener('pointerdown', stamp, true);
      window.removeEventListener('keydown', stamp, true);
    };
  }, []);
  useEffect(() => {
    const fresh = () => performance.now() - lastInput.current < 800;   // ignore changes the app made on its own (e.g. the first fit)
    if (watch === 'zoom' || watch === 'rotate') {
      let a0 = camState.azimuth, z0 = camState.zoom;
      const t = setInterval(() => {
        if (!fresh()) { a0 = camState.azimuth; z0 = camState.zoom; return; }
        const da = Math.abs(Math.atan2(Math.sin(camState.azimuth - a0), Math.cos(camState.azimuth - a0)));
        const dz = Math.abs(Math.log(camState.zoom / z0));
        if (watch === 'zoom' ? dz > 0.22 : da > 0.35) { clearInterval(t); done(); }
      }, 120);
      return () => clearInterval(t);
    }
    // Store-driven steps: done when the thing becomes set (a new item / selection / pickup).
    return useStore.subscribe((s, prev) => {
      if (watch === 'add' && s.data.nodes.length + s.data.zones.length > prev.data.nodes.length + prev.data.zones.length) done();
      if (watch === 'select' && s.selection && s.selection.id !== prev.selection?.id) done();
      if (watch === 'lift' && s.liftedId && !prev.liftedId) done();
    });
  }, [watch, done]);
}

export function Intro({ onDone, steps = EDITOR_TOUR }) {
  const [i, setI] = useState(0);
  const finished = i >= steps.length;
  const step = STEPS[steps[Math.min(i, steps.length - 1)]];
  const next = useCallback(() => setI((n) => n + 1), []);
  useStepWatcher(finished ? null : step.watch, next);
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [finished, onDone]);

  return (
    <div className="intro" role="status" aria-live="polite">
      {finished ? (
        <div className="intro-text done"><strong>✓ You're all set</strong><span>The camera tips are always under the share/file menu.</span></div>
      ) : (
        <>
          <div className="intro-scene">
            <Mouse mode={step.mouse} />
            <Demo mode={step.mouse} />
          </div>
          <div className="intro-text">
            <strong>{step.title}</strong>
            <span>{step.text}</span>
            <div className="intro-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
              {steps.map((s, k) => <i key={s} className={k < i ? 'done' : k === i ? 'now' : ''} />)}
            </div>
          </div>
          <button className="intro-skip" onClick={onDone}>Skip</button>
        </>
      )}
    </div>
  );
}
