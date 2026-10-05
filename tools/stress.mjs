// Stress test: generates diagrams of increasing size, probes the server limits, and drives a real browser.
// Usage: PW=/path/to/node_modules/playwright node tools/stress.mjs [0,50,150,...]   (server on :3001)
// Note: headless Chromium here uses software WebGL, so absolute FPS is far lower than on a real GPU;
// compare draw calls, label-layout ms, DOM nodes, heap and load time instead.
import { createRequire } from 'node:module';
import { writeFileSync, appendFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const base = 'http://localhost:3001';
const OUT = 'stress-results.jsonl';
writeFileSync(OUT, '');
const log = (o) => { appendFileSync(OUT, JSON.stringify(o) + '\n'); console.log(JSON.stringify(o)); };

const SHAPES = ['box', 'cylinder', 'sphere', 'user', 'server', 'router', 'switch', 'firewall', 'accesspoint', 'antenna', 'pc', 'laptop', 'phone', 'printer', 'database', 'cache', 'cloud', 'container', 'pyramid'];
const COLORS = ['#4f8cff', '#22b8a6', '#f5a524', '#ef5b7b', '#8b6cf6', '#64748b'];
function gen(N, linkRatio = 1.5) {
  const cols = Math.ceil(Math.sqrt(N)), nodes = [], connectors = [], zones = [];
  for (let i = 0; i < N; i++) nodes.push({ id: `n${i}`, label: `Node ${i}`, subtitle: `10.0.${i >> 8}.${i & 255}`, description: '', shape: SHAPES[i % SHAPES.length], color: COLORS[i % COLORS.length], position: [(i % cols) * 3, 0, Math.floor(i / cols) * 3], icon: null });
  const want = Math.round(N * linkRatio);
  for (let i = 0; i < N && connectors.length < want; i++) {
    if ((i % cols) < cols - 1 && i + 1 < N) connectors.push({ id: `c${connectors.length}`, from: `n${i}`, to: `n${i + 1}`, route: 'orthogonal', line: 'solid', arrow: true, label: '', color: COLORS[i % COLORS.length], flow: i % 3 === 0 ? 'forward' : i % 10 === 1 ? 'both' : 'none', color2: '#f5a524' });
    if (i + cols < N && connectors.length < want && i % 2 === 0) connectors.push({ id: `c${connectors.length}`, from: `n${i}`, to: `n${i + cols}`, route: 'orthogonal-z', line: 'dashed', arrow: false, label: '', color: '#64748b' });
  }
  for (let z = 0; z < Math.floor(N / 50); z++) zones.push({ id: `z${z}`, label: `Zone ${z}`, color: COLORS[z % COLORS.length], position: [((z * 4) % cols) * 3 + 4.5, 0, Math.floor((z * 4) / cols) * 3 + 0.5], size: [10, 0, 8], labelMode: 'edge', labelEdge: 'back' });
  return { nodes, connectors, zones };
}
const j = (m, b) => ({ method: m, headers: { 'content-type': 'application/json' }, body: b == null ? undefined : JSON.stringify(b) });
const time = async (fn) => { const t = performance.now(); const r = await fn(); return [Math.round(performance.now() - t), r]; };

// ---------- 1) server-enforced limits ----------
{
  const probe = async (label, data, expectNote) => {
    const body = JSON.stringify({ name: 'limit-probe', data });
    const [ms, res] = await time(() => fetch(base + '/api/diagrams', { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
    const txt = await res.text();
    let id = null; try { id = JSON.parse(txt).id; } catch {}
    if (id) await fetch(`${base}/api/diagrams/${id}`, { method: 'DELETE' });
    log({ test: 'server-limit', label, status: res.status, ms, bodyKB: Math.round(body.length / 1024), note: res.ok ? 'accepted' : txt.slice(0, 80) });
  };
  await probe('2000 nodes / 3000 links', gen(2000));
  await probe('2001 nodes', gen(2001));
  await probe('1000 nodes / 4001 links', { ...gen(1000), connectors: Array.from({ length: 4001 }, (_, i) => ({ id: `x${i}`, from: 'n0', to: 'n1', route: 'straight', line: 'solid', arrow: false, label: '' })) });
  const bigIcon = 'data:image/png;base64,' + 'A'.repeat(390_000);
  await probe('10 nodes with 390KB icons (4MB body cap)', { nodes: Array.from({ length: 11 }, (_, i) => ({ id: `i${i}`, label: 'x', description: '', shape: 'box', color: '#fff', position: [i, 0, 0], icon: bigIcon })), connectors: [], zones: [] });
}

// ---------- 2) browser benchmark ----------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const fpsProbe = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  let n = 0, worst = 0, last = performance.now(); const start = last;
  const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - start < ms) requestAnimationFrame(f); else res({ fps: +(n / ((t - start) / 1000)).toFixed(1), worstMs: Math.round(worst) }); };
  requestAnimationFrame(f);
}), ms);

const sizes = (process.argv[2] ?? '0,50,150,300,600,1000,1500,2000').split(',').map(Number);
for (const N of sizes) {
  const data = gen(N);
  const body = JSON.stringify({ name: `stress-${N}`, data });
  const [createMs, created] = await time(async () => (await fetch(base + '/api/diagrams', j('POST', { name: `stress-${N}`, data }))).json());
  if (!created.id) { log({ N, error: 'create failed', created }); continue; }
  const [getMs] = await time(() => fetch(`${base}/api/diagrams/${created.id}`).then((r) => r.text()));
  const [putMs] = await time(() => fetch(`${base}/api/diagrams/${created.id}`, j('PUT', { name: `stress-${N}`, data })).then((r) => r.text()));
  const row = { N, links: data.connectors.length, zones: data.zones.length, jsonKB: Math.round(body.length / 1024), apiCreateMs: createMs, apiGetMs: getMs, apiSaveMs: putMs };

  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  try {
    const t0 = Date.now();
    await page.goto(`${base}/d/${created.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 60000 });
    if (N > 0) await page.waitForFunction((n) => document.querySelectorAll('.label').length >= n * 0.95, N, { timeout: 150000, polling: 500 });
    row.loadMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    row.idle = await fpsProbe(page, 3000);
    // zoom interaction: wheel events while measuring frames
    const zoomP = fpsProbe(page, 2500);
    await page.mouse.move(700, 450);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i % 2 ? 250 : -250); await page.waitForTimeout(150); }
    row.zoom = await zoomP;
    // click-to-select latency (label click -> side panel visible)
    if (N > 0) {
      await page.click('button[aria-label="Fit to content"]'); await page.waitForTimeout(1200);
      const t1 = Date.now();
      await page.evaluate(() => document.querySelector('.label')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
      try { await page.waitForSelector('.panel', { timeout: 20000 }); row.selectMs = Date.now() - t1; } catch { row.selectMs = '>20000'; }
      const t2 = Date.now();
      await page.click('button[aria-label="Rotate right 90°"]');
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      row.rotateMs = Date.now() - t2;
    }
    Object.assign(row, await page.evaluate(() => ({ labelLayoutMs: +(window.__strataPerf?.labelMs ?? 0).toFixed(1), drawCalls: window.__strataPerf?.calls, triangles: window.__strataPerf?.triangles, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), domNodes: document.getElementsByTagName('*').length })));
  } catch (e) { row.error = String(e.message).split('\n')[0]; }
  row.errors = errors.length ? errors.slice(0, 2) : undefined;
  log(row);
  await page.close();
  await fetch(`${base}/api/diagrams/${created.id}`, { method: 'DELETE' });
  const stuck = row.error || (row.idle && row.idle.fps < 0.5) || row.loadMs > 120000;
  if (stuck) { log({ stoppedAt: N, reason: 'unusable (load timeout or <0.5 fps)' }); break; }
}
await browser.close();
log({ done: true });
