import React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function Field({ label, hint, children, className }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label>{label}</Label>
      {hint && <p className="-mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint.replace(/^ · /, '')}</p>}
      {children}
    </div>
  );
}

export const Segmented = ({ value, onChange, options, className }) => (
  <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} className={cn('w-full', className)}>
    {options.map(([v, l]) => <ToggleGroupItem key={v} value={v}>{l}</ToggleGroupItem>)}
  </ToggleGroup>
);

// A slider with its value beside the name. `onReset` shows when the value was set here rather than inherited.
export function RangeField({ label, value, min, max, step, onChange, onReset }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          {Number(value.toFixed(2))}
          {onReset && <button type="button" aria-label={`Reset ${label}`} title="Back to the default" onClick={onReset} className="rounded p-0.5 hover:bg-accent hover:text-foreground"><RotateCcw className="size-3" /></button>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}
        className="h-5 w-full cursor-pointer accent-primary" />
    </div>
  );
}
