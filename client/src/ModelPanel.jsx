import React from 'react';
import { RotateCw, Trash2, Upload } from 'lucide-react';
import { useStore } from './store';
import { deleteModel, useModels } from './models';
import { clampScale, rotationDegrees } from './modelFit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function ModelPanel({ node, Field, busy, error, onUpload, onError }) {
  const s = useStore();
  const list = useModels((m) => m.list);
  const using = new Set(s.data.nodes.filter((n) => n.shape === 'model').map((n) => n.modelId));
  const rotation = rotationDegrees(node);
  const scale = clampScale(node.modelScale);
  const turn = (axis, value) => s.updateNode(node.id, { modelRotation: rotation.map((d, i) => (i === axis ? value : d)) });
  const remove = async (id) => {
    try { await deleteModel(id); onError(''); } catch (e) { onError(e.message); }
  };

  return (
    <>
      <Field label="3D model">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {list.map((m) => (
            <div key={m.id} className="flex items-center gap-1">
              <button
                className={cn('flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40', node.modelId === m.id && 'border-primary bg-primary/10')}
                aria-pressed={node.modelId === m.id} onClick={() => s.updateNode(node.id, { modelId: m.id })}
              >
                <span className="truncate font-medium">{m.name}</span><span className="shrink-0 text-muted-foreground">{size(m.size)}</span>
              </button>
              <button className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
                disabled={using.has(m.id)} title={using.has(m.id) ? 'In use by a node' : 'Delete this file'} aria-label={`Delete ${m.name}`} onClick={() => remove(m.id)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={onUpload}><Upload /> {busy ? 'Uploading…' : 'Upload .glb or .gltf'}</Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </Field>
      <Field label="Size" hint={` · ${scale.toFixed(2)}× of one cell`}>
        <div className="flex items-center gap-2">
          <input type="range" className="min-w-0 flex-1 accent-primary" min="0.1" max="5" step="0.05" value={Math.min(5, Math.max(0.1, scale))}
            onChange={(e) => s.updateNode(node.id, { modelScale: Number(e.target.value) })} aria-label="Model size" />
          <Button variant="ghost" size="xs" onClick={() => s.updateNode(node.id, { modelScale: 1 })}>Reset</Button>
        </div>
      </Field>
      <Field label="Rotation" hint=" · degrees">
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-2">
          {['X', 'Y', 'Z'].map((axis, i) => (
            <label key={axis} className="grid gap-1 text-[11px] text-muted-foreground">{axis}
              <Input type="number" step="15" min="-3600" max="3600" value={rotation[i]} onChange={(e) => { if (e.target.value !== '') turn(i, Math.max(-3600, Math.min(3600, Number(e.target.value)))); }} />
            </label>
          ))}
          <Button variant="outline" size="icon" title="Turn 90° around the vertical axis" aria-label="Turn 90 degrees" onClick={() => turn(1, ((rotation[1] + 90 + 180) % 360) - 180)}><RotateCw /></Button>
        </div>
      </Field>
    </>
  );
}
