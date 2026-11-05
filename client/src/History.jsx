import React, { useEffect, useState } from 'react';
import { History as HistoryIcon, RotateCcw, Trash2 } from 'lucide-react';
import { api } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const KIND = { auto: 'Automatic copy', manual: 'Saved version', restore: 'Before a restore' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function History({ id, canDelete, onRestored, onClose }) {
  const [versions, setVersions] = useState(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);

  const refresh = () => api.versions(id).then(setVersions).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const attempt = async (action) => {
    try { setError(''); await action(); await refresh(); } catch (e) { setError(e.message); }
  };

  const restore = async () => {
    const version = target;
    setTarget(null);
    await attempt(async () => onRestored(await api.restoreVersion(id, version.id)));
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HistoryIcon className="size-5" /> Version history</DialogTitle>
            <DialogDescription>Strata keeps a copy of the diagram before a save replaces it, at most every few minutes, plus every version you save here. Restoring keeps the current state as a version first, so you can go back.</DialogDescription>
          </DialogHeader>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); attempt(async () => { await api.saveVersion(id, label); setLabel(''); }); }}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} placeholder="Name this version (optional)" aria-label="Version name" />
            <Button type="submit" variant="outline">Save version</Button>
          </form>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {versions === null ? <p className="text-sm text-muted-foreground">Loading…</p>
            : versions.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No versions yet. They appear as you keep editing.</p>
            : (
              <ul className="grid max-h-[50vh] grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-lg border bg-card py-2 pr-2 pl-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="truncate text-sm font-semibold">{v.label || KIND[v.kind]}</strong>
                      <span className="truncate text-xs text-muted-foreground">
                        {new Date(v.savedAt).toLocaleString()}{v.authorName ? ` · ${v.authorName}` : ''} · {plural(v.nodes, 'node', 'nodes')}, {plural(v.connectors, 'connection', 'connections')}, {plural(v.zones, 'zone', 'zones')}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setTarget(v)}><RotateCcw /> Restore</Button>
                    {canDelete && <Button variant="ghost" size="icon-sm" aria-label="Delete this version" className="text-muted-foreground hover:text-destructive" onClick={() => attempt(() => api.deleteVersion(id, v.id))}><Trash2 /></Button>}
                  </li>
                ))}
              </ul>
            )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore “{target?.label || target?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The diagram goes back to how it was on {target && new Date(target.savedAt).toLocaleString()}. What is open now is kept as a version first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={restore}>Restore</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
