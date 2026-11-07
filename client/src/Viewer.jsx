import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LayoutGrid } from 'lucide-react';
import { Logo } from './Logo';
import { Link } from './App';
import { Presence } from './presence';
import { api } from './api';
import { useModelSource } from './models';
import { Scene } from './Scene';
import { useStore } from './store';
import { Details } from './Editor';
import { CameraTools } from './Topbar';
import { Intro, useIntro, VIEWER_TOUR } from './Intro';
import { useEmbed } from './embedState.js';
import { parseEmbed, resolveHighlight } from './embedOptions.js';
import { aspectOf } from './framing.js';
import { useTheme } from './theme';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

// In an embed the top bar is hidden; it slides in when the pointer goes to the top edge (tap it on touch screens).
function AutoHideBar({ children }) {
  const [open, setOpen] = useState(false);
  const timer = useRef();
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 500); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <div className="absolute inset-x-0 top-0 z-40 h-[34px]" onMouseEnter={show} onMouseLeave={hide} onClick={() => setOpen((o) => !o)} />
      <div onMouseEnter={show} onMouseLeave={hide}
        className={cn('absolute inset-x-0 top-0 z-[41] -translate-y-[105%] transition-[transform,box-shadow] duration-200', open && 'translate-y-0 shadow-lg')}>{children}</div>
    </>
  );
}

export function ReadOnlyDiagram({ name, token, embed = false, home = false }) {
  const intro = useIntro(!embed);
  const opts = useEmbed((s) => s.opts);
  const active = useEmbed((s) => s.active);
  const gated = embed && opts.interact === 'click';

  const bar = (
    <header className="z-40 flex h-14 items-center justify-between gap-3 border-b bg-card px-3">
      <div className="flex min-w-0 items-center gap-2.5"><Logo size={26} /><strong className="truncate text-[15px]">{name}</strong></div>
      <div className="flex items-center gap-2">
        {home && <Presence />}
        <CameraTools />
        {!(embed && opts.theme) && <ThemeToggle />}
        {home && <Button variant="outline" size="sm" asChild><Link to="/"><LayoutGrid /> All diagrams</Link></Button>}
        {embed && <Button variant="outline" size="sm" asChild><a href={`/v/${token}`} target="_blank" rel="noreferrer">Open <ArrowUpRight /></a></Button>}
      </div>
    </header>
  );

  return (
    <div className="relative flex h-full flex-col">
      {embed ? (opts.toolbar === 'hidden' ? null : opts.toolbar === 'visible' ? bar : <AutoHideBar>{bar}</AutoHideBar>) : bar}
      <div className="stage group relative min-h-0 flex-1">
        <Scene />
        <Details readOnly />
        {gated && !active && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center opacity-0 transition-opacity group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
            <span className="rounded-full border bg-card/95 px-3 py-1 text-xs font-medium text-muted-foreground shadow">Click to explore</span>
          </div>
        )}
        {intro.show && <Intro onDone={intro.dismiss} steps={VIEWER_TOUR} />}
      </div>
    </div>
  );
}

// Tell the page around an embed what shape it would like to be, so a loader script can size the frame to fit.
function reportSize(token, ratio) {
  if (window.parent !== window) window.parent.postMessage({ strata: 'embed-size', token, ratio }, '*');
}

function startEmbed(data) {
  const opts = parseEmbed(window.location.search);
  const pins = resolveHighlight(opts.highlight, data.nodes ?? []);
  useEmbed.getState().start(opts, pins);
  if (opts.theme) useTheme.getState().force(opts.theme, opts.transparent);
  document.documentElement.classList.toggle('transparent', opts.transparent);
  return opts;
}

export function Viewer({ token, embed = false }) {
  useModelSource(`/api/shared/${token}/models`, null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    api.shared(token)
      .then((d) => {
        const opts = embed ? startEmbed(d.data) : null;
        useStore.getState().load(d.name, d.data, true);
        const ratio = opts ? aspectOf(d.data.nodes ?? [], d.data.zones ?? [], Math.PI / 4 + (opts.angle * Math.PI) / 180) : null;
        setState({ status: 'ready', name: d.name, ratio });
      })
      .catch(() => setState({ status: 'missing' }));
  }, [token, embed]);

  // The loader script may arrive after the frame has already said its piece, so it can also ask.
  useEffect(() => {
    if (!state.ratio) return undefined;
    const answer = (e) => { if (e.data?.strata === 'embed-hello') reportSize(token, state.ratio); };
    window.addEventListener('message', answer);
    reportSize(token, state.ratio);
    return () => window.removeEventListener('message', answer);
  }, [token, state.ratio]);

  if (state.status === 'loading') return <div className="grid h-full place-content-center text-muted-foreground">Loading…</div>;
  if (state.status === 'missing') return <div className="grid h-full place-content-center gap-1 text-center"><h2 className="text-xl font-semibold">Diagram not found</h2><p className="text-muted-foreground">The link may have been revoked.</p></div>;
  return <ReadOnlyDiagram name={state.name} token={token} embed={embed} />;
}
