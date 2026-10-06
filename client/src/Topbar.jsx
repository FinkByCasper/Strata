import React from 'react';
import { CircleHelp, Download, FileJson, Grid3x3, ImageDown, LayoutGrid, MousePointer2, Orbit, Spline, Redo2, RotateCcw, RotateCw, Scan, Share2, Undo2, Upload } from 'lucide-react';
import { Logo } from './Logo';
import { Link, navigate } from './App';
import { useStore } from './store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

// A small grouped strip of icon buttons (the "pill" that holds related tools).
export const Strip = ({ className, ...props }) => <div className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)} {...props} />;

function Tool({ icon, label, keys, onClick, disabled, pressed }) {
  return (
    <Hint label={label} keys={keys}>
      <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}
        className={cn('text-muted-foreground hover:bg-card hover:text-foreground', pressed && 'bg-card text-primary shadow-sm')}>
        {icon}
      </Button>
    </Hint>
  );
}

export function CameraTools() {
  const setView = useStore((s) => s.setView);
  return (
    <Strip role="group" aria-label="Camera">
      <Tool icon={<RotateCcw />} label="Rotate left 90°" keys="Q" onClick={() => setView('rotL')} />
      <Tool icon={<RotateCw />} label="Rotate right 90°" keys="E" onClick={() => setView('rotR')} />
      <Tool icon={<Scan />} label="Fit to content" keys="F" onClick={() => setView('fit')} />
      <Tool icon={<Orbit />} label="Reset camera" onClick={() => setView('reset')} />
    </Strip>
  );
}

const STATUS = { saved: ['bg-success', 'Saved'], saving: ['bg-warning', 'Saving…'], error: ['bg-destructive', 'Save failed'] };

export function Topbar({ status, onShare, onExportJson, onExportPng, onImport, onTips }) {
  const name = useStore((s) => s.name);
  const mode = useStore((s) => s.mode);
  const snap = useStore((s) => s.snap);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const st = useStore.getState();
  const [dot, text] = STATUS[status] ?? STATUS.saved;

  return (
    <header className="z-40 grid min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b bg-card px-3 py-1.5 max-[900px]:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 items-center gap-2">
        <Hint label="All diagrams"><Link to="/" className="grid place-items-center rounded-md p-1 hover:bg-accent" aria-label="All diagrams"><Logo size={26} /></Link></Hint>
        <Input value={name} onChange={(e) => st.setName(e.target.value)} aria-label="Diagram name" placeholder="Untitled diagram"
          className="h-8 w-64 min-w-0 max-w-full flex-1 border-transparent bg-transparent text-[15px] font-semibold shadow-none hover:border-input focus-visible:bg-card sm:flex-none" />
        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground max-sm:hidden" role="status">
          <i className={cn('size-1.5 rounded-full', dot)} />{text}
        </span>
      </div>

      <div className="flex items-center gap-2 max-[900px]:order-3 max-[900px]:col-span-full max-[900px]:justify-center">
        <ToggleGroup type="single" value={mode} onValueChange={(v) => v && st.setMode(v)} aria-label="Tool">
          <Hint label="Select" keys="V"><ToggleGroupItem value="select" aria-label="Select"><MousePointer2 /></ToggleGroupItem></Hint>
          <Hint label="Connect" keys="C"><ToggleGroupItem value="connect" aria-label="Connect"><Spline /></ToggleGroupItem></Hint>
        </ToggleGroup>
        <Strip role="group" aria-label="History">
          <Tool icon={<Undo2 />} label="Undo" keys="Ctrl+Z" disabled={!canUndo} onClick={() => st.undo()} />
          <Tool icon={<Redo2 />} label="Redo" keys="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => st.redo()} />
        </Strip>
      </div>

      <div className="flex items-center justify-end gap-2">
        <div className="max-sm:hidden"><CameraTools /></div>
        <Strip><Tool icon={<Grid3x3 />} label="Snap to grid" keys="G" pressed={snap} onClick={() => st.setSnap(!snap)} /></Strip>
        <ThemeToggle />
        <DropdownMenu>
          <Hint label="Share & file">
            <DropdownMenuTrigger asChild><Button size="icon" aria-label="Share & file"><Share2 /></Button></DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onShare} className="font-medium"><Share2 /> Share link &amp; embed…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExportJson}><FileJson /> Export JSON</DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportPng}><ImageDown /> Export PNG</DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}><Upload /> Import JSON…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/')}><LayoutGrid /> All diagrams</DropdownMenuItem>
            <DropdownMenuItem onSelect={onTips}><CircleHelp /> Show camera tips</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">Build {typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
