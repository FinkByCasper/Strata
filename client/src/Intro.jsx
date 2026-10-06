import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { camState } from './hold';
import { useStore } from './store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

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
  move: { mouse: 'hold', title: 'Hold to move', text: 'Press and hold a node for a moment, drag it to another square and let go.', watch: 'lift' },
};
export const EDITOR_TOUR = ['zoom', 'rotate', 'add', 'select', 'move'];
export const VIEWER_TOUR = ['zoom', 'rotate', 'details'];

function Mouse({ mode }) {
  return (
    <svg className={`mouse ${mode}`} viewBox="0 0 40 60" width="46" height="69" aria-hidden>
      <rect className="body" x="4" y="4" width="32" height="52" rx="16" strokeWidth="2.5" />
      <path className="lbtn" d="M4 24V20a16 16 0 0 1 16-16V24Z" />
      <path className="rbtn" d="M36 24V20A16 16 0 0 0 20 4V24Z" />
      <line className="split" x1="20" y1="4" x2="20" y2="24" strokeWidth="2" />
      <line className="split" x1="4.5" y1="24" x2="35.5" y2="24" strokeWidth="2" />
      <rect className="wheel" x="17" y="9" width="6" height="11" rx="3" />
    </svg>
  );
}

function Demo({ mode }) {
  return (
    <div className={`intro-demo ${mode} grid size-[70px] place-items-center rounded-xl bg-muted`}>
      {mode === 'right' && <div className="mini-menu grid w-[38px] gap-1.5 rounded-lg bg-popover p-1.5 shadow-md"><i className="h-1.5 rounded-sm bg-primary" /><i className="h-1.5 rounded-sm bg-border" /></div>}
      {mode !== 'right' && <Logo size={52} title="" />}
    </div>
  );
}

// Watches what the user does and calls `done` once the current step's action has happened.
function useStepWatcher(watch, done) {
  const lastInput = useRef(-1e9);   // "never": the app's own first camera fit must not count as the user zooming
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
    <div className="intro absolute bottom-6 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-4 rounded-2xl border bg-card py-3 pr-3 pl-4 shadow-xl animate-in fade-in-0 slide-in-from-bottom-4" role="status" aria-live="polite">
      {finished ? (
        <div className="flex min-w-[260px] flex-col gap-0.5"><strong className="flex items-center gap-1.5 text-[15px]"><Check className="size-4 text-success" /> You're all set</strong><span className="text-xs text-muted-foreground">The camera tips are always under the share/file menu.</span></div>
      ) : (
        <>
          <div className="flex items-center gap-3.5">
            <Mouse mode={step.mouse} />
            <Demo mode={step.mouse} />
          </div>
          <div className="flex min-w-[180px] max-w-[250px] flex-col gap-0.5">
            <strong className="text-[15px]">{step.title}</strong>
            <span className="text-xs text-muted-foreground">{step.text}</span>
            <div className="mt-1.5 flex gap-1.5" aria-label={`Step ${i + 1} of ${steps.length}`}>
              {steps.map((k, n) => <i key={k} className={cn('size-1.5 rounded-full bg-border transition-all', n < i && 'bg-success', n === i && 'scale-125 bg-primary')} />)}
            </div>
          </div>
          <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={onDone}>Skip</Button>
        </>
      )}
    </div>
  );
}
