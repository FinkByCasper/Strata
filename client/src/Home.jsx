import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus, Trash2, Upload } from 'lucide-react';
import { Logo } from './Logo';
import { api } from './api';
import { Link, navigate } from './App';
import { EMPTY, parseDiagram } from './model';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function Home() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [doomed, setDoomed] = useState(null);   // the diagram waiting for the delete confirmation
  const file = useRef();

  const refresh = () => api.list().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const create = async (name = 'Untitled diagram', data = EMPTY()) => {
    try { navigate(`/d/${(await api.create(name, data)).id}`); } catch (e) { setError(e.message); }
  };

  const importFile = async (f) => {
    if (!f) return;
    try {
      const { name, data } = parseDiagram(await f.text());
      await create(name ?? f.name.replace(/\.json$/i, ''), data);
    } catch (e) { setError(`Import failed: ${e.message}`); }
  };

  const remove = async () => {
    const item = doomed;
    setDoomed(null);
    await api.remove(item.id);
    refresh();
  };

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-10">
      <div className="mb-10 flex justify-end"><ThemeToggle /></div>
      <header className="flex flex-col gap-4">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight"><Logo size={44} /> Strata</h1>
        <p className="text-base text-muted-foreground">3D diagrams with a free camera and labels you can actually read.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => create()}><Plus /> New diagram</Button>
          <Button variant="outline" onClick={() => file.current.click()}><Upload /> Import JSON</Button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </header>

      <section className="mt-10">
        {items === null ? <p className="text-muted-foreground">Loading…</p>
          : items.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No diagrams yet. Create your first one.</p>
          : (
            <ul className="grid gap-2">
              {items.map((it) => (
                <li key={it.id} className="group flex items-center rounded-xl border bg-card pr-2 pl-4 shadow-xs transition-colors hover:border-ring/60">
                  <Link to={`/d/${it.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-foreground">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="truncate font-semibold">{it.name}</strong>
                      <span className="text-xs text-muted-foreground">{new Date(it.updatedAt).toLocaleString()}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Hint label="Delete"><Button variant="ghost" size="icon-sm" aria-label={`Delete ${it.name}`} onClick={() => setDoomed(it)} className="text-muted-foreground hover:text-destructive"><Trash2 /></Button></Hint>
                </li>
              ))}
            </ul>
          )}
      </section>

      <AlertDialog open={!!doomed} onOpenChange={(o) => !o && setDoomed(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doomed?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone, and its share links will stop working.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
