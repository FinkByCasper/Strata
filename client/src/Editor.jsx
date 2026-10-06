import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Link } from './App';
import { Scene } from './Scene';
import { useStore } from './store';
import { ICONS, LABEL_EDGES, ROUTES, ROUTE_NAMES, parseDiagram } from './model';
import { RichText } from './richtext';
import { ContextMenu, ShapePicker, Swatches } from './Menu';
import { Topbar } from './Topbar';
import { Intro, useIntro } from './Intro';
import { ArrowLeftRight, Ban, Check, Copy, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { zoneMembers } from './highlight';

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};
const slug = (s) => (s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';

export { CameraTools as ViewButtons } from './Topbar';

// ---- side panel pieces ----
const nodeName = (data, id) => data.nodes.find((n) => n.id === id)?.label || 'Untitled';

// The floating inspector card on the right of the stage.
function Panel({ title, subtitle, children }) {
  return (
    <aside className="absolute top-3 right-3 z-[35] flex max-h-[calc(100%-1.5rem)] w-[290px] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg max-[720px]:inset-x-2 max-[720px]:top-auto max-[720px]:bottom-2 max-[720px]:max-h-[48%] max-[720px]:w-auto">
      <div className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h3 className="text-sm leading-tight font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

function Field({ label, hint, children, className }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label>{label}</Label>
      {hint && <p className="-mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint.replace(/^ · /, '')}</p>}
      {children}
    </div>
  );
}

const Segmented = ({ value, onChange, options, className }) => (
  <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} className={cn('w-full', className)}>
    {options.map(([v, l]) => <ToggleGroupItem key={v} value={v}>{l}</ToggleGroupItem>)}
  </ToggleGroup>
);

const DeleteButton = ({ children, onClick }) => (
  <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onClick}><Trash2 /> {children}</Button>
);

export function Details({ readOnly }) {
  const sel = useStore((s) => s.selection);
  const data = useStore((s) => s.data);
  if (!sel) return null;
  const node = sel.type === 'node' && data.nodes.find((n) => n.id === sel.id);
  const conn = sel.type === 'connector' && data.connectors.find((c) => c.id === sel.id);
  if (readOnly) {
    if (conn) {
      return (
        <Panel title={conn.label || 'Connection'} subtitle={`${nodeName(data, conn.from)} → ${nodeName(data, conn.to)}${conn.subtitle ? ` · ${conn.subtitle}` : ''}`}>
          {conn.description ? <RichText text={conn.description} /> : <p className="text-muted-foreground">No description.</p>}
        </Panel>
      );
    }
    if (!node) return null;
    return (
      <Panel title={node.label || 'Untitled'} subtitle={node.subtitle}>
        {node.description ? <RichText text={node.description} /> : <p className="text-muted-foreground">No description.</p>}
      </Panel>
    );
  }
  return <Inspector sel={sel} />;
}

// A freshly created node/zone focuses (and selects) its label so you can just start typing the name.
function LabelInput({ id, value, onChange }) {
  const ref = useRef();
  useEffect(() => {
    if (useStore.getState().fresh !== id) return;
    ref.current?.focus(); ref.current?.select();
    useStore.setState({ fresh: null });
  }, [id]);
  // Enter / Esc finish naming and hand the keyboard back to the diagram, so Cmd+C / Cmd+V / D work straight away.
  return <Input ref={ref} value={value} onChange={onChange} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); } }} />;
}

const NumberInput = ({ value, onChange }) => (
  <Input type="number" step="1" value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
);

function Inspector({ sel }) {
  const s = useStore();
  const { data } = s;
  const fileRef = useRef();
  const [iconError, setIconError] = useState('');

  const pair = (arr, labels, idx, set) => (
    <div className="grid grid-cols-2 gap-2">
      {labels.map((l, k) => <Field key={l} label={l}><NumberInput value={arr[idx[k]]} onChange={(v) => set(arr.map((x, j) => (j === idx[k] ? v : x)))} /></Field>)}
    </div>
  );

  const uploadIcon = (f, id) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setIconError('Use a PNG, JPEG, WebP or GIF.');
    if (f.size > 150_000) return setIconError('Icon must be under 150 KB.');
    setIconError('');
    const r = new FileReader();
    r.onload = () => s.updateNode(id, { icon: r.result });
    r.readAsDataURL(f);
  };

  if (sel.type === 'node') {
    const n = data.nodes.find((x) => x.id === sel.id);
    if (!n) return null;
    const iconBtn = (on) => cn('grid size-8 place-items-center rounded-md border bg-card text-base outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40', on && 'border-primary bg-primary/10');
    return (
      <Panel title="Node">
        <Field label="Label"><LabelInput id={n.id} value={n.label} onChange={(e) => s.updateNode(n.id, { label: e.target.value })} /></Field>
        <Field label="Subtitle" hint=" · second line, e.g. an IP"><Input value={n.subtitle ?? ''} onChange={(e) => s.updateNode(n.id, { subtitle: e.target.value })} /></Field>
        <Field label="Description" hint=" · **bold**, *italic*, `code`, - lists"><Textarea rows={5} value={n.description} onChange={(e) => s.updateNode(n.id, { description: e.target.value })} /></Field>
        <Field label="Model"><ShapePicker value={n.shape} onPick={(shape) => s.updateNode(n.id, { shape })} /></Field>
        <Field label="Colour"><Swatches value={n.color} onPick={(color) => s.updateNode(n.id, { color })} /></Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            <button className={iconBtn(!n.icon)} onClick={() => s.updateNode(n.id, { icon: null })} aria-label="No icon"><Ban className="size-4 text-muted-foreground" /></button>
            {ICONS.map((i) => <button key={i} className={iconBtn(n.icon === i)} onClick={() => s.updateNode(n.id, { icon: i })}>{i}</button>)}
            <button className={iconBtn(false)} onClick={() => fileRef.current.click()} title="Upload your own icon" aria-label="Upload your own icon"><ImagePlus className="size-4 text-muted-foreground" /></button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { uploadIcon(e.target.files[0], n.id); e.target.value = ''; }} />
          </div>
          {iconError && <p className="text-xs text-destructive">{iconError}</p>}
        </Field>
        {pair(n.position, ['X', 'Z'], [0, 2], (p) => s.updateNode(n.id, { position: p }))}
        <DeleteButton onClick={s.removeSelection}>Delete node</DeleteButton>
      </Panel>
    );
  }

  if (sel.type === 'connector') {
    const c = data.connectors.find((x) => x.id === sel.id);
    if (!c) return null;
    const flow = c.flow ?? 'none';
    return (
      <Panel title="Connector" subtitle={`${nodeName(data, c.from)} → ${nodeName(data, c.to)}`}>
        <Field label="Label"><Input value={c.label} onChange={(e) => s.updateConnector(c.id, { label: e.target.value })} /></Field>
        <Field label="Subtitle" hint=" · e.g. port and protocol"><Input value={c.subtitle ?? ''} placeholder="TCP 5432 · TLS" onChange={(e) => s.updateConnector(c.id, { subtitle: e.target.value })} /></Field>
        <Field label="Description" hint=" · **bold**, *italic*, `code`, - lists"><Textarea rows={4} value={c.description ?? ''} onChange={(e) => s.updateConnector(c.id, { description: e.target.value })} /></Field>
        <Field label="Routing">
          <Select value={c.route} onValueChange={(route) => s.updateConnector(c.id, { route })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROUTES.map((x) => <SelectItem key={x} value={x}>{ROUTE_NAMES[x] ?? x}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Line"><Segmented value={c.line} onChange={(line) => s.updateConnector(c.id, { line })} options={[['solid', 'Solid'], ['dashed', 'Dashed']]} /></Field>
        <Field label="Colour"><Swatches value={c.color || '#475569'} onPick={(color) => s.updateConnector(c.id, { color })} /></Field>
        <Field label="Data flow">
          <Segmented value={flow} onChange={(m) => s.updateConnector(c.id, { flow: m })} options={[['none', 'Off'], ['forward', 'One way'], ['both', 'Both ways']]} />
          <p className="text-xs text-muted-foreground">{flow === 'none' ? "Small dots travel along the line in the arrow's direction." : flow === 'both' ? 'Line colour goes forward; the return colour comes back in its own lane.' : 'Dots travel from the source to the target in the line colour.'}</p>
        </Field>
        {flow === 'both' && <Field label="Return colour"><Swatches value={c.color2 || '#f5a524'} onPick={(color2) => s.updateConnector(c.id, { color2 })} /></Field>}
        <Field label="Arrowheads">
          <label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={!!c.arrow} onCheckedChange={(v) => s.updateConnector(c.id, { arrow: v === true })} /> At the target ({nodeName(data, c.to)})</label>
          <label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={!!c.arrowStart} onCheckedChange={(v) => s.updateConnector(c.id, { arrowStart: v === true })} /> At the source ({nodeName(data, c.from)})</label>
        </Field>
        <Button variant="outline" onClick={() => s.updateConnector(c.id, { from: c.to, to: c.from })}><ArrowLeftRight /> Reverse direction</Button>
        <DeleteButton onClick={s.removeSelection}>Delete connector</DeleteButton>
      </Panel>
    );
  }

  const z = data.zones.find((x) => x.id === sel.id);
  if (!z) return null;
  const mode = z.labelMode ?? 'edge';
  return (
    <Panel title="Zone" subtitle={zoneSummary(z, data)}>
      <Field label="Label"><LabelInput id={z.id} value={z.label} onChange={(e) => s.updateZone(z.id, { label: e.target.value })} /></Field>
      <Field label="Colour"><Swatches value={z.color} onPick={(color) => s.updateZone(z.id, { color })} /></Field>
      <Field label="Name on the floor">
        <Segmented value={mode} onChange={(m) => s.updateZone(z.id, { labelMode: m })} options={[['edge', 'On an edge'], ['center', 'Centre'], ['none', 'None']]} />
        {mode === 'edge' && <Segmented value={z.labelEdge ?? 'back'} onChange={(ed) => s.updateZone(z.id, { labelEdge: ed })} options={LABEL_EDGES.map((e) => [e, e])} className="mt-1 [&_button]:capitalize" />}
      </Field>
      <div className="grid gap-1.5"><Label>Centre <span className="font-normal text-muted-foreground">· moves what is inside too</span></Label>{pair(z.position, ['X', 'Z'], [0, 2], (p) => s.moveZone(z.id, p[0], p[2]))}</div>
      <div className="grid gap-1.5"><Label>Size</Label>{pair(z.size, ['Width', 'Depth'], [0, 2], (p) => s.updateZone(z.id, { size: [Math.max(1, p[0]), 0, Math.max(1, p[2])] }))}</div>
      <DeleteButton onClick={s.removeSelection}>Delete zone</DeleteButton>
    </Panel>
  );
}

function ShareDialog({ id, viewToken, onClose, onRotate }) {
  const origin = window.location.origin;
  const link = `${origin}/v/${viewToken}`;
  const embed = `<iframe src="${origin}/embed/${viewToken}" width="800" height="500" style="border:0" allowfullscreen></iframe>`;
  const [copied, setCopied] = useState('');
  const [revoke, setRevoke] = useState(false);
  // navigator.clipboard only exists on HTTPS / localhost; on plain http fall back to a hidden textarea.
  const copy = (key, t) => {
    const done = () => { setCopied(key); setTimeout(() => setCopied(''), 1600); };
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t).then(done, () => {});
    const ta = Object.assign(document.createElement('textarea'), { value: t });
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { /* nothing more to try */ }
    ta.remove();
  };
  const row = (key, label, value) => (
    <Field label={label}>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button variant="outline" onClick={() => copy(key, value)} className="w-24">{copied === key ? <><Check /> Copied</> : <><Copy /> Copy</>}</Button>
      </div>
    </Field>
  );
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share (view-only)</DialogTitle>
            <DialogDescription>Anyone with the link can view but not edit. Regenerate it to revoke the old link and embeds.</DialogDescription>
          </DialogHeader>
          {row('link', 'Link', link)}
          {row('embed', 'Embed', embed)}
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRevoke(true)}><RefreshCw /> Regenerate link</Button>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={revoke} onOpenChange={setRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Revoke the current link?</AlertDialogTitle><AlertDialogDescription>The old link and every embed using it will stop working.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => onRotate(id)}>Regenerate</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Toast() {
  const msg = useStore((s) => s.toast);
  return msg ? <div className="pointer-events-none absolute top-3.5 left-1/2 z-[60] -translate-x-1/2 animate-in rounded-full bg-foreground px-4 py-1.5 text-[13px] text-background shadow-lg fade-in-0 slide-in-from-top-2" role="status">{msg}</div> : null;
}

// Shown while in Connect mode: a glowing frame round the viewport plus a banner saying what to do next.
function ConnectOverlay() {
  const mode = useStore((s) => s.mode);
  const from = useStore((s) => s.connectFrom);
  const name = useStore((s) => s.data.nodes.find((n) => n.id === s.connectFrom)?.label);
  if (mode !== 'connect') return null;
  return (
    <>
      <div className="connect-frame" />
      <div className="absolute top-3 left-1/2 z-[26] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-[#f5a524] py-1.5 pr-1.5 pl-4 text-[13px] font-semibold text-[#1f1300] shadow-[0_6px_20px_rgb(245_165_36/0.45)]" role="status">
        <span>{from ? `Connect mode · now click the node to link “${name || 'Untitled'}” to` : 'Connect mode · click a node to start a connection'}</span>
        <button className="rounded-full bg-black/15 px-3 py-1 hover:bg-black/25" onClick={() => useStore.getState().setMode('select')}>Done (Esc)</button>
      </div>
    </>
  );
}

function zoneSummary(z, data) {
  const inside = new Set(zoneMembers(z, data.nodes).map((n) => n.id));
  const links = data.connectors.filter((c) => inside.has(c.from) || inside.has(c.to)).length;
  return `${inside.size} ${inside.size === 1 ? 'item' : 'items'} inside · ${links} ${links === 1 ? 'connection' : 'connections'}. Everything in the zone is highlighted while it is selected.`;
}

export function Editor({ id }) {
  const s = useStore();
  const [meta, setMeta] = useState(null); // { viewToken }
  const [status, setStatus] = useState('loading'); // loading | saved | saving | error | missing
  const [sharing, setSharing] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);   // a parsed file waiting for the "replace?" confirmation
  const importRef = useRef();
  const intro = useIntro(status !== 'loading' && status !== 'missing');

  useEffect(() => {
    api.get(id)
      .then((d) => { useStore.getState().load(d.name, d.data, false); setMeta({ viewToken: d.viewToken }); setStatus('saved'); })
      .catch(() => setStatus('missing'));
  }, [id]);

  // Debounced autosave whenever the document revision changes.
  useEffect(() => {
    if (s.rev === 0 || status === 'loading' || status === 'missing') return;
    setStatus('saving');
    const t = setTimeout(() => {
      const { name, data } = useStore.getState();
      api.save(id, name || 'Untitled diagram', data).then(() => setStatus('saved')).catch(() => setStatus('error'));
    }, 800);
    return () => clearTimeout(t);
  }, [s.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e) => { if (useStore.getState().rev && status !== 'saved') e.preventDefault(); };
    const key = (e) => {
      const t = e.target;   // let real text fields keep their own copy/paste/undo (checkboxes, sliders and buttons are not text fields)
      if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !/^(checkbox|radio|range|button|color|file|submit)$/.test(t.type))) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        const is = (letter) => key === letter || e.code === `Key${letter.toUpperCase()}`;   // `code` covers other keyboard layouts
        if (key === 'z') { e.preventDefault(); e.shiftKey ? useStore.getState().redo() : useStore.getState().undo(); return; }
        if (key === 'y') { e.preventDefault(); useStore.getState().redo(); return; }
        if (is('c') && useStore.getState().selection) { e.preventDefault(); useStore.getState().copySelection(); return; }
        if (is('v')) { e.preventDefault(); useStore.getState().pasteClipboard(); return; }
        if (is('d')) { e.preventDefault(); useStore.getState().duplicateSelection(); return; }   // Ctrl/Cmd+D would bookmark the page
      }
      if (e.key === 'Delete' || e.key === 'Backspace') useStore.getState().removeSelection();
      if (e.key === 'Escape') {
        const st = useStore.getState();
        if (st.placing) { st.cancelPlacing(); return; }   // first Esc only drops the paste preview
        st.setMode('select'); st.select(null);
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === 'd') st.duplicateSelection();
      else if (k === 'v') st.setMode('select');
      else if (k === 'c') st.setMode('connect');
      else if (k === 'g') st.setSnap(!st.snap);
      else if (k === 'q') st.setView('rotL');
      else if (k === 'e') st.setView('rotR');
      else if (k === 'f') st.setView('fit');
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', key); };
  }, [status]);

  if (status === 'missing') return <div className="grid h-full place-content-center gap-2 text-center"><h2 className="text-xl font-semibold">Diagram not found</h2><Link to="/">Back to diagrams</Link></div>;
  if (status === 'loading') return <div className="grid h-full place-content-center text-muted-foreground">Loading…</div>;

  const exportJson = () => download(`${slug(s.name)}.strata.json`, JSON.stringify({ name: s.name, data: s.data }, null, 2), 'application/json');
  const exportPng = () => {
    const c = document.querySelector('canvas');
    // Only the WebGL layer is captured; DOM labels are not part of the image.
    c?.toBlob((b) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `${slug(s.name)}.png` }); a.click(); });
  };
  const importJson = async (f) => {
    if (!f) return;
    try {
      const { name, data } = parseDiagram(await f.text());
      setPendingImport({ name, data });
    } catch (e) { s.showToast(`Import failed: ${e.message}`); }
  };

  return (
    <div className="relative flex h-full flex-col">
      <Topbar status={status} onShare={() => setSharing(true)} onExportJson={exportJson} onExportPng={exportPng}
        onImport={() => importRef.current.click()} onTips={intro.replay} />
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importJson(e.target.files[0]); e.target.value = ''; }} />
      <div className="stage relative min-h-0 flex-1">
        <Scene />
        <Details />
        <ContextMenu />
        <ConnectOverlay />
        <Toast />
        {intro.show && <Intro onDone={intro.dismiss} />}
      </div>
      <AlertDialog open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Replace this diagram?</AlertDialogTitle><AlertDialogDescription>The imported file replaces everything in “{s.name || 'this diagram'}”. You can undo it with Ctrl/Cmd+Z.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { s.replaceData(pendingImport.name, pendingImport.data); s.setView('fit'); setPendingImport(null); }}>Replace</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {sharing && meta && (
        <ShareDialog id={id} viewToken={meta.viewToken} onClose={() => setSharing(false)}
          onRotate={async (i) => setMeta({ viewToken: (await api.rotate(i)).viewToken })} />
      )}
    </div>
  );
}
