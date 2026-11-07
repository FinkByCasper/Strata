import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Copy } from 'lucide-react';
import { useStore } from './store';
import { Field, Segmented } from './fields';
import { embedQuery, embedSnippet } from './embedOptions.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none__';

// Builds the embed snippet from the choices made here. Nothing is stored: the options only live in the URL it produces.
export function EmbedOptions({ origin, token, copy, copied }) {
  const nodes = useStore((s) => s.data.nodes);
  const [open, setOpen] = useState(false);
  const [responsive, setResponsive] = useState(true);
  const [opts, setOpts] = useState({ angle: 0, toolbar: 'auto', theme: null, transparent: false, interact: 'click', highlight: [] });
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));

  // A name that two nodes share would highlight both, so those are offered by id instead.
  const choices = useMemo(() => {
    const count = new Map();
    for (const n of nodes) count.set(n.label, (count.get(n.label) ?? 0) + 1);
    return nodes.filter((n) => n.label?.trim()).map((n) => ({ value: count.get(n.label) > 1 ? n.id : n.label, label: count.get(n.label) > 1 ? `${n.label} (${n.id})` : n.label }));
  }, [nodes]);

  const snippet = embedSnippet({ origin, token, opts, responsive });
  const preview = `${origin}/embed/${token}${embedQuery(opts)}`;

  return (
    <div className="grid gap-3">
      <Field label="Embed">
        <div className="flex gap-2">
          <Input readOnly value={snippet.replace(/\n/g, ' ')} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <Button variant="outline" onClick={() => copy('embed', snippet)} className="w-24">{copied === 'embed' ? <><Check /> Copied</> : <><Copy /> Copy</>}</Button>
        </div>
      </Field>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="-mt-1 flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} /> Embed options
      </button>
      {open && (
        <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
          <Field label="Size" hint="A column-wide frame that picks its own height from the diagram needs the one-line script after it.">
            <Segmented value={responsive ? 'fit' : 'fixed'} onChange={(v) => setResponsive(v === 'fit')} options={[['fit', 'Fits its column'], ['fixed', 'Fixed 800 × 500']]} />
          </Field>
          <Field label="Toolbar"><Segmented value={opts.toolbar} onChange={(toolbar) => set({ toolbar })} options={[['auto', 'Slides in'], ['hidden', 'Hidden'], ['visible', 'Always shown']]} /></Field>
          <Field label="Theme"><Segmented value={opts.theme ?? 'default'} onChange={(v) => set({ theme: v === 'default' ? null : v })} options={[['default', 'Default'], ['light', 'Light'], ['dark', 'Dark'], ['auto', 'System']]} /></Field>
          <Field label="Starting view" hint="Turns the diagram a quarter turn at a time.">
            <Segmented value={String(opts.angle)} onChange={(v) => set({ angle: Number(v) })} options={[['0', 'Front'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} />
          </Field>
          <Field label="Highlight a node" hint="Everything not connected to it fades back.">
            <Select value={opts.highlight[0] ?? NONE} onValueChange={(v) => set({ highlight: v === NONE ? [] : [v] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{choices.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="embed-clear" checked={opts.transparent} onCheckedChange={(v) => set({ transparent: v === true })} />
            <Label htmlFor="embed-clear" className="font-normal">Transparent background</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="embed-click" checked={opts.interact === 'click'} onCheckedChange={(v) => set({ interact: v === true ? 'click' : 'always' })} />
            <Label htmlFor="embed-click" className="font-normal">Scroll the page until the viewer clicks into the diagram</Label>
          </div>
          <Button variant="outline" size="sm" className="w-fit" asChild><a href={preview} target="_blank" rel="noreferrer">Preview <ArrowUpRight /></a></Button>
        </div>
      )}
    </div>
  );
}
