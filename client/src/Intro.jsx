import React, { useCallback, useEffect, useState } from 'react';
import { Logo } from './Logo';

const KEY = 'strata.intro.seen';

// First-run camera tip: a short looping animation (scroll to zoom, then drag to rotate) instead of permanent
// help text. It goes away after two loops, or as soon as you actually zoom or drag, and is remembered.
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

function Mouse({ mode }) {
  return (
    <svg className={`mouse ${mode}`} viewBox="0 0 40 60" width="46" height="69" aria-hidden>
      <rect x="4" y="4" width="32" height="52" rx="16" fill="#fff" stroke="#334155" strokeWidth="2.5" />
      <path className="lbtn" d="M4 24V20a16 16 0 0 1 16-16V24Z" />
      <line x1="20" y1="4" x2="20" y2="24" stroke="#334155" strokeWidth="2" />
      <line x1="4.5" y1="24" x2="35.5" y2="24" stroke="#334155" strokeWidth="2" />
      <rect className="wheel" x="17" y="9" width="6" height="11" rx="3" />
    </svg>
  );
}

export function Intro({ onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => s + 1), 3200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (step >= 4) onDone(); }, [step, onDone]);
  useEffect(() => {
    // Doing the real thing is the best "got it".
    const done = () => onDone();
    window.addEventListener('wheel', done, { capture: true, once: true, passive: true });
    window.addEventListener('pointerdown', done, { capture: true, once: true });
    return () => { window.removeEventListener('wheel', done, true); window.removeEventListener('pointerdown', done, true); };
  }, [onDone]);

  const zoom = step % 2 === 0;
  return (
    <div className="intro" role="status" aria-live="polite">
      <div className="intro-scene">
        <Mouse mode={zoom ? 'zoom' : 'rotate'} />
        <div className={`intro-demo ${zoom ? 'zoom' : 'rotate'}`}><Logo size={52} title="" /></div>
      </div>
      <div className="intro-text">
        <strong>{zoom ? 'Scroll to zoom' : 'Drag to rotate'}</strong>
        <span>{zoom ? 'Move the wheel to get closer or further away' : 'Hold the left button on empty space and drag sideways'}</span>
      </div>
      <button className="intro-x" onClick={onDone} aria-label="Dismiss tip">×</button>
    </div>
  );
}
