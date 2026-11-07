import React from 'react';
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
