// Generates examples/software-platform-250-nodes.strata.json: a made-up e-commerce platform (microservices on
// Kubernetes, Kafka, observability, CI/CD, data platform). Deterministic, so the file can be regenerated.
//   node tools/gen-software-example.mjs
import { writeFileSync } from 'node:fs';

let q = 0;
const id = (p) => p + ++q;
const nodes = [], connectors = [], zones = [];
const node = (label, shape, x, z, color, subtitle = '') => {
  const n = { id: id('n'), label, subtitle, description: '', shape, color, position: [x, 0, z], icon: null };
  nodes.push(n); return n;
};
const link = (a, b, o = {}) => {
  connectors.push({ id: id('c'), from: a.id, to: b.id, route: 'orthogonal', line: 'solid', arrow: true, arrowStart: false, label: '', subtitle: '', description: '', color: '#64748b', flow: 'none', color2: '#f5a524', ...o });
};
const zone = (label, color, cx, cz, w, d, edge = 'back') => zones.push({ id: id('z'), label, color, position: [cx, 0, cz], size: [w, 0, d], labelMode: 'edge', labelEdge: edge });

// A zone sized to hold `items` laid out `cols` per row, 3 cells apart so nothing touches; returns the placed nodes.
const GAP = 3;
function group(label, color, cx, cz, cols, items) {
  const rows = Math.ceil(items.length / cols);
  const w = cols * GAP + 2, d = rows * GAP + 3;
  if (w % 2 === 0) cx += 0.5;           // zone edges must land on cell borders
  if (d % 2 === 0) cz += 0.5;
  zone(label, color, cx, cz, w, d);
  const x0 = Math.round(cx - (GAP * (cols - 1)) / 2), z0 = Math.round(cz - (GAP * (rows - 1)) / 2) + 1;
  return items.map(([name, shape, col, sub], i) => node(name, shape, x0 + (i % cols) * GAP, z0 + Math.floor(i / cols) * GAP, col ?? color, sub ?? ''));
}

const BLUE = '#4f7be0', TEAL = '#22b8a6', PURPLE = '#8b6cf6', ORANGE = '#f5a524', RED = '#ef5b7b', GREY = '#64748b', GREEN = '#3fb27f';

// ---- the 16 service domains, in a 4 x 4 block ----
const domains = [
  ['Identity', '#4f8cff'], ['Catalog', '#22b8a6'], ['Search', '#8b6cf6'], ['Cart', '#f5a524'],
  ['Pricing', '#ef5b7b'], ['Inventory', '#3fb27f'], ['Orders', '#4f8cff'], ['Payments', '#ef5b7b'],
  ['Shipping', '#22b8a6'], ['Notifications', '#8b6cf6'], ['Reviews', '#f5a524'], ['Recommendations', '#3fb27f'],
  ['Billing', '#ef5b7b'], ['Loyalty', '#4f8cff'], ['Returns', '#22b8a6'], ['Support', '#8b6cf6'],
];
const DX = 14, DZ = 18, X0 = 12, Z0 = -27;
const D = {};
domains.forEach(([name, color], i) => {
  const cx = X0 + (i % 4) * DX, cz = Z0 + Math.floor(i / 4) * DZ;
  zone(`${name} service`, color, cx, cz, 11, 14);
  const s = name.toLowerCase();
  const api = node(`${name} API`, 'server', cx, cz - 5, color, `${s}-api · REST + gRPC`);
  const cache = node(`${name} cache`, 'cache', cx - 3, cz - 5, ORANGE, 'Redis');
  const worker = node(`${name} worker`, 'box', cx + 3, cz - 5, GREY, 'async jobs');
  const podAt = [[-3, -2], [0, -2], [3, -2], [-3, 1]];
  const pods = podAt.map(([dx, dz], k) => node(`${s}-pod-${k + 1}`, 'container', cx + dx, cz + dz, color, 'k8s pod'));
  const db = node(`${name} DB`, 'database', cx, cz + 1, TEAL, 'Postgres primary');
  const replica = node(`${name} replica`, 'database', cx + 3, cz + 1, '#8fd6cc', 'read replica');
  const flags = node(`${name} flags`, 'slab', cx, cz + 4, GREY, 'feature flags');
  link(api, cache, { label: '', color: ORANGE });
  link(api, db, { route: 'orthogonal-z', flow: 'both', color: TEAL, color2: BLUE });
  link(db, replica, { color: TEAL, line: 'dashed' });
  link(api, worker, { color: GREY, route: 'curved' });
  link(api, flags, { color: GREY, line: 'dashed' });
  pods.forEach((p) => link(api, p, { color }));
  D[name] = { api, db, worker, pods };
});

// ---- the rest of the platform ----
const clients = group('Clients', GREY, -42, -20, 2, [
  ['Web shop', 'laptop', BLUE, 'React SPA'], ['iOS app', 'phone', BLUE], ['Android app', 'phone', BLUE], ['Partner API', 'cloud', '#f8fafc', 'B2B'],
  ['Admin console', 'pc', PURPLE], ['Kiosk', 'pc', GREY, 'in-store'], ['Call centre', 'user', GREY], ['Marketplace feed', 'cloud', '#f8fafc', 'CSV / API'],
]);
const edge = group('Edge', PURPLE, -28, -20, 2, [
  ['DNS', 'cloud', '#f8fafc', 'Route 53'], ['CDN', 'cloud', '#f8fafc', 'static + images'], ['WAF', 'firewall', RED], ['DDoS shield', 'firewall', RED],
  ['Load balancer A', 'router', PURPLE, 'eu-west'], ['Load balancer B', 'router', PURPLE, 'us-east'], ['API gateway', 'switch', BLUE, 'rate limits · auth'], ['GraphQL BFF', 'server', BLUE, 'for the apps'],
  ['Edge cache', 'cache', ORANGE], ['Bot filter', 'firewall', RED], ['TLS terminator', 'router', PURPLE],
]);
const security = group('Security', RED, -28, 4, 2, [
  ['Identity provider', 'server', RED, 'OIDC'], ['Vault', 'database', RED, 'secrets'], ['Key service', 'server', RED, 'KMS'], ['Audit log', 'database', GREY], ['SIEM', 'pc', RED], ['Scanner', 'laptop', RED, 'SAST / DAST'],
]);
const mq = group('Messaging', ORANGE, X0 + 3 * DX + 17, -27, 4, [
  ['Kafka 1', 'cylinder', ORANGE], ['Kafka 2', 'cylinder', ORANGE], ['Kafka 3', 'cylinder', ORANGE], ['Kafka 4', 'cylinder', ORANGE],
  ['Kafka 5', 'cylinder', ORANGE], ['Schema registry', 'server', GREY], ['Kafka Connect', 'server', GREY], ['Dead letters', 'slab', RED],
  ['orders.created', 'slab', ORANGE], ['payments.settled', 'slab', ORANGE], ['stock.changed', 'slab', ORANGE], ['emails.queue', 'slab', ORANGE],
  ['shipments.update', 'slab', ORANGE], ['reviews.posted', 'slab', ORANGE],
]);
const platform = group('Kubernetes platform', BLUE, X0 + 3 * DX + 17, -6, 4, [
  ['Control plane 1', 'server', BLUE], ['Control plane 2', 'server', BLUE], ['Control plane 3', 'server', BLUE], ['etcd', 'database', BLUE],
  ['Ingress A', 'router', PURPLE], ['Ingress B', 'router', PURPLE], ['Service mesh', 'switch', PURPLE, 'mTLS'], ['Autoscaler', 'pyramid', GREEN],
  ['Node pool A', 'server', GREY, '32 nodes'], ['Node pool B', 'server', GREY, '24 nodes'], ['Config store', 'database', GREY],
]);
const obs = group('Observability', GREEN, X0 + 3 * DX + 17, 12, 3, [
  ['Prometheus A', 'database', GREEN], ['Prometheus B', 'database', GREEN], ['Grafana', 'pc', GREEN], ['Loki', 'database', GREEN, 'logs'], ['Tempo', 'database', GREEN, 'traces'],
  ['Alertmanager', 'antenna', RED], ['On-call pager', 'phone', RED, 'PagerDuty'], ['Sentry', 'cloud', '#f8fafc', 'errors'], ['Status page', 'cloud', '#f8fafc'],
]);
const cicd = group('CI / CD', PURPLE, X0 + 3 * DX + 37, -27, 3, [
  ['Git repos', 'database', PURPLE], ['CI runner 1', 'server', PURPLE], ['CI runner 2', 'server', PURPLE], ['CI runner 3', 'server', PURPLE], ['CI runner 4', 'server', PURPLE],
  ['Image registry', 'database', PURPLE], ['Artifact store', 'database', GREY], ['Argo CD', 'pyramid', GREEN, 'GitOps'], ['Staging cluster', 'cloud', '#f8fafc'], ['Image scanner', 'firewall', RED],
]);
const data = group('Data platform', TEAL, X0 + 3 * DX + 37, -6, 3, [
  ['Data lake', 'database', TEAL, 'S3'], ['Warehouse', 'database', TEAL, 'Snowflake'], ['ETL 1', 'server', GREY], ['ETL 2', 'server', GREY], ['ETL 3', 'server', GREY],
  ['BI dashboards', 'laptop', BLUE], ['ML training', 'server', PURPLE, 'GPU'], ['Feature store', 'database', PURPLE], ['Model registry', 'database', PURPLE], ['Reverse ETL', 'server', GREY],
]);
const ext = group('Third parties', GREY, X0 + 3 * DX + 37, 15, 3, [
  ['Stripe', 'cloud', '#f8fafc', 'cards'], ['PayPal', 'cloud', '#f8fafc'], ['SendGrid', 'cloud', '#f8fafc', 'email'], ['Twilio', 'cloud', '#f8fafc', 'SMS'],
  ['DHL', 'cloud', '#f8fafc'], ['UPS', 'cloud', '#f8fafc'], ['Maps API', 'cloud', '#f8fafc'], ['Tax service', 'cloud', '#f8fafc'], ['Slack', 'cloud', '#f8fafc', 'alerts'], ['Zendesk', 'cloud', '#f8fafc'], ['Intercom', 'cloud', '#f8fafc'],
]);
const by = (list, name) => list.find((n) => n.label === name);

// ---- wiring ----
const [web, ios, android, partner, admin, kiosk, call, feed] = clients;
const dns = by(edge, 'DNS'), cdn = by(edge, 'CDN'), waf = by(edge, 'WAF'), ddos = by(edge, 'DDoS shield'), lbA = by(edge, 'Load balancer A'), lbB = by(edge, 'Load balancer B'), gw = by(edge, 'API gateway'), bff = by(edge, 'GraphQL BFF');
[web, ios, android, kiosk].forEach((c) => link(c, dns, { color: BLUE, flow: 'forward' }));
[partner, feed, admin, call].forEach((c) => link(c, ddos, { color: GREY, flow: 'forward' }));
link(dns, cdn, { color: PURPLE, flow: 'forward' }); link(cdn, waf, { color: PURPLE, flow: 'forward' }); link(ddos, waf, { color: PURPLE, flow: 'forward' });
link(waf, lbA, { color: PURPLE, flow: 'forward' }); link(waf, lbB, { color: PURPLE, flow: 'forward' });
link(lbA, gw, { color: BLUE, flow: 'forward' }); link(lbB, gw, { color: BLUE, flow: 'forward' }); link(gw, bff, { color: BLUE, flow: 'forward', route: 'curved' });
link(gw, by(security, 'Identity provider'), { color: RED, line: 'dashed', label: 'auth' });
Object.values(D).forEach((d) => link(gw, d.api, { color: BLUE, route: 'orthogonal-z', flow: 'forward' }));

const call2 = (a, b, o = {}) => link(D[a].api, D[b].api, { color: PURPLE, route: 'curved', line: 'dashed', flow: 'forward', ...o });
call2('Catalog', 'Search', { label: 'index' }); call2('Reviews', 'Catalog'); call2('Recommendations', 'Catalog'); call2('Cart', 'Pricing'); call2('Cart', 'Inventory');
call2('Orders', 'Cart'); call2('Orders', 'Inventory', { label: 'reserve' }); call2('Orders', 'Payments', { label: 'charge' }); call2('Orders', 'Shipping');
call2('Payments', 'Billing'); call2('Orders', 'Loyalty'); call2('Returns', 'Orders'); call2('Returns', 'Payments', { label: 'refund' }); call2('Support', 'Orders'); call2('Identity', 'Loyalty');

const topic = (n) => by(mq, n);
const pub = (d, t) => link(D[d].worker, topic(t), { color: ORANGE, route: 'curved', flow: 'forward' });
pub('Orders', 'orders.created'); pub('Payments', 'payments.settled'); pub('Inventory', 'stock.changed'); pub('Notifications', 'emails.queue'); pub('Shipping', 'shipments.update'); pub('Reviews', 'reviews.posted');
const sub = (t, d) => link(topic(t), D[d].worker, { color: ORANGE, route: 'curved', flow: 'forward' });
sub('orders.created', 'Notifications'); sub('orders.created', 'Shipping'); sub('payments.settled', 'Orders'); sub('stock.changed', 'Catalog'); sub('shipments.update', 'Notifications'); sub('reviews.posted', 'Recommendations');
['Kafka 1', 'Kafka 2', 'Kafka 3', 'Kafka 4', 'Kafka 5'].forEach((k) => link(by(mq, k), by(mq, 'Schema registry'), { color: GREY, line: 'dashed' }));
link(by(mq, 'Kafka Connect'), by(data, 'Data lake'), { color: TEAL, route: 'curved', flow: 'forward', label: 'CDC' });

const ext2 = (d, e, o = {}) => link(D[d].api, by(ext, e), { color: GREY, route: 'curved', flow: 'both', ...o });
ext2('Payments', 'Stripe', { label: 'cards', color: RED }); ext2('Payments', 'PayPal'); ext2('Notifications', 'SendGrid'); ext2('Notifications', 'Twilio'); ext2('Shipping', 'DHL'); ext2('Shipping', 'UPS'); ext2('Shipping', 'Maps API'); ext2('Pricing', 'Tax service'); ext2('Support', 'Zendesk'); ext2('Support', 'Intercom'); link(by(obs, 'Alertmanager'), by(ext, 'Slack'), { color: GREY, route: 'curved', flow: 'forward' });

const prom = by(obs, 'Prometheus A');
['Identity', 'Catalog', 'Orders', 'Payments'].forEach((n) => link(D[n].api, prom, { color: GREEN, line: 'dashed', route: 'curved' }));   // the busiest four; scraping all 16 would just be a hairball
link(prom, by(obs, 'Grafana'), { color: GREEN }); link(prom, by(obs, 'Alertmanager'), { color: GREEN }); link(by(obs, 'Alertmanager'), by(obs, 'On-call pager'), { color: RED, flow: 'forward', label: 'page' });
link(by(obs, 'Prometheus B'), prom, { color: GREEN, line: 'dashed' }); link(by(obs, 'Loki'), by(obs, 'Grafana'), { color: GREEN }); link(by(obs, 'Tempo'), by(obs, 'Grafana'), { color: GREEN });

const [repos, r1, r2, r3, r4, registry, artifacts, argo, staging, imgscan] = cicd;
link(repos, r1, { color: PURPLE, flow: 'forward' }); link(repos, r2, { color: PURPLE }); link(repos, r3, { color: PURPLE }); link(repos, r4, { color: PURPLE });
[r1, r2, r3, r4].forEach((r) => link(r, registry, { color: PURPLE, flow: 'forward' }));
link(registry, imgscan, { color: RED }); link(registry, argo, { color: GREEN, flow: 'forward', label: 'deploy' }); link(argo, staging, { color: GREEN, route: 'curved' }); link(r1, artifacts, { color: GREY, line: 'dashed' });
link(argo, by(platform, 'Control plane 1'), { color: GREEN, route: 'curved', flow: 'forward', label: 'sync' });

['Control plane 2', 'Control plane 3', 'etcd'].forEach((n) => link(by(platform, 'Control plane 1'), by(platform, n), { color: BLUE }));
link(by(platform, 'Ingress A'), by(platform, 'Service mesh'), { color: PURPLE }); link(by(platform, 'Ingress B'), by(platform, 'Service mesh'), { color: PURPLE });
link(by(platform, 'Autoscaler'), by(platform, 'Node pool A'), { color: GREEN }); link(by(platform, 'Autoscaler'), by(platform, 'Node pool B'), { color: GREEN });

const [lake, wh, e1, e2, e3, bi, ml, fs, reg, rev] = data;
[e1, e2, e3].forEach((e) => link(e, lake, { color: TEAL, flow: 'forward' })); link(lake, wh, { color: TEAL, flow: 'forward' }); link(wh, bi, { color: BLUE });
link(lake, ml, { color: PURPLE }); link(ml, fs, { color: PURPLE }); link(ml, reg, { color: PURPLE }); link(reg, D.Recommendations.api, { color: PURPLE, route: 'curved', flow: 'forward', label: 'model' }); link(wh, rev, { color: GREY });
[D.Orders.db, D.Catalog.db, D.Payments.db].forEach((db, k) => link(db, [e1, e2, e3][k], { color: TEAL, line: 'dashed', route: 'curved' }));

const sec = (n) => by(security, n);
link(sec('Identity provider'), D.Identity.api, { color: RED, line: 'dashed' }); link(sec('Vault'), sec('Key service'), { color: RED }); link(sec('Audit log'), sec('SIEM'), { color: RED });
link(sec('Scanner'), repos, { color: RED, line: 'dashed', route: 'curved' });

const out = { name: 'Software platform · microservices (250 nodes)', data: { nodes, connectors, zones } };
writeFileSync(new URL('../examples/software-platform-250-nodes.strata.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`${nodes.length} nodes, ${connectors.length} connectors, ${zones.length} zones`);
