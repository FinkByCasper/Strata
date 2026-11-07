import React, { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useStore } from './store';
import { Swatches } from './Menu';
import { Field, RangeField, Segmented } from './fields';
import { ARROW_HEADS, FLOW_SHAPES, LOOK_KEYS, RANGES, resolveStyle } from './connectorStyle.js';
import { cn } from '@/lib/utils';

const back = (onChange, key) => () => onChange({ [key]: undefined });

// The look controls, shared by one connector's panel and the diagram defaults. `own` holds what was set at this level: a control shows a
// reset button only for those, because for the rest the value on show is inherited.
export function StyleFields({ value, own, onChange, showReturn = true }) {
  const reset = (key) => (own && own[key] !== undefined ? back(onChange, key) : undefined);
  const range = (key) => <RangeField key={key} {...RANGES[key]} value={value[key]} onChange={(v) => onChange({ [key]: v })} onReset={reset(key)} />;
  const resetButton = (key, label) => reset(key) && (
    <button type="button" onClick={reset(key)} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="size-3" /> {label}</button>
  );
  return (
    <div className="grid gap-3">
      <Field label="Arrow head">
        <Segmented value={value.arrowHead} onChange={(arrowHead) => onChange({ arrowHead })} options={ARROW_HEADS} />
        {resetButton('arrowHead', 'Use the default')}
      </Field>
      {range('arrowSize')}
      {range('lineWidth')}
      <Field label="Data-flow dots" hint="Shown while data flow is on for the connector.">
        <Segmented value={value.flowShape} onChange={(flowShape) => onChange({ flowShape })} options={FLOW_SHAPES} />
        {resetButton('flowShape', 'Use the default')}
      </Field>
      {range('flowSize')}
      {range('flowSpeed')}
      {range('flowDensity')}
      <Field label="Dot colour" hint={own?.flowColor === undefined ? 'Follows the line colour unless you choose one.' : undefined}>
        <Swatches value={value.flowColor} onPick={(flowColor) => onChange({ flowColor })} />
        {resetButton('flowColor', 'Follow the line colour')}
      </Field>
      {showReturn && (
        <Field label="Return dot colour" hint="For connectors with data flowing both ways.">
          <Swatches value={value.flowColor2} onPick={(flowColor2) => onChange({ flowColor2 })} />
          {resetButton('flowColor2', 'Use the default')}
        </Field>
      )}
    </div>
  );
}

// One connector's own look, tucked away until wanted. Anything left alone follows the diagram's defaults.
export function ConnectorLook({ connector, showReturn }) {
  const defaults = useStore((s) => s.data.style?.connector);
  const update = useStore((s) => s.updateConnector);
  const [open, setOpen] = useState(false);
  const value = resolveStyle(connector, defaults);
  const own = Object.fromEntries(LOOK_KEYS.map((k) => [k, connector[k]]).filter(([, v]) => v !== undefined));
  if (own.flowColor2 === undefined && connector.color2) own.flowColor2 = connector.color2;
  // The return colour used to be stored as `color2`, so taking it back out has to clear that too.
  const change = (patch) => update(connector.id, 'flowColor2' in patch && patch.flowColor2 === undefined ? { ...patch, color2: undefined } : patch);
  return (
    <div className="grid gap-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} /> Arrow and flow style
        {Object.keys(own).length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{Object.keys(own).length} set here</span>}
      </button>
      {open && <StyleFields value={value} own={own} onChange={change} showReturn={showReturn} />}
    </div>
  );
}
