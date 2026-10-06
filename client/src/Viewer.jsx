import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Logo } from './Logo';
import { api } from './api';
import { Scene } from './Scene';
import { useStore } from './store';
import { Details } from './Editor';
import { CameraTools } from './Topbar';
import { Intro, useIntro, VIEWER_TOUR } from './Intro';
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

export function Viewer({ token, embed = false }) {
  const [state, setState] = useState({ status: 'loading' });
  const intro = useIntro(!embed && state.status === 'ready');

  useEffect(() => {
    api.shared(token)
      .then((d) => { useStore.getState().load(d.name, d.data, true); setState({ status: 'ready', name: d.name }); })
      .catch(() => setState({ status: 'missing' }));
  }, [token]);

  if (state.status === 'loading') return <div className="grid h-full place-content-center text-muted-foreground">Loading…</div>;
  if (state.status === 'missing') return <div className="grid h-full place-content-center gap-1 text-center"><h2 className="text-xl font-semibold">Diagram not found</h2><p className="text-muted-foreground">The link may have been revoked.</p></div>;

  const bar = (
    <header className="z-40 flex h-14 items-center justify-between gap-3 border-b bg-card px-3">
      <div className="flex min-w-0 items-center gap-2.5"><Logo size={26} /><strong className="truncate text-[15px]">{state.name}</strong></div>
      <div className="flex items-center gap-2">
        <CameraTools />
        <ThemeToggle />
        {embed && <Button variant="outline" size="sm" asChild><a href={`/v/${token}`} target="_blank" rel="noreferrer">Open <ArrowUpRight /></a></Button>}
      </div>
    </header>
  );

  return (
    <div className="relative flex h-full flex-col">
      {embed ? <AutoHideBar>{bar}</AutoHideBar> : bar}
      <div className="stage relative min-h-0 flex-1">
        <Scene />
        <Details readOnly />
        {intro.show && <Intro onDone={intro.dismiss} steps={VIEWER_TOUR} />}
      </div>
    </div>
  );
}
