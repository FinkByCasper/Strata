import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(file = process.env.STRATA_DB || './data/strata.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagrams (
      id TEXT PRIMARY KEY,
      view_token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const q = {
    list: db.prepare('SELECT id, name, updated_at FROM diagrams ORDER BY updated_at DESC'),
    get: db.prepare('SELECT * FROM diagrams WHERE id = ?'),
    byToken: db.prepare('SELECT * FROM diagrams WHERE view_token = ?'),
    insert: db.prepare('INSERT INTO diagrams (id, view_token, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE diagrams SET name = ?, data = ?, updated_at = ? WHERE id = ?'),
    rotate: db.prepare('UPDATE diagrams SET view_token = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM diagrams WHERE id = ?'),
  };

  const full = (r) => r && {
    id: r.id, viewToken: r.view_token, name: r.name,
    data: JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at,
  };
  const newToken = () => randomBytes(16).toString('base64url');

  return {
    list: () => q.list.all().map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at })),
    get: (id) => full(q.get.get(id)),
    getByToken: (t) => full(q.byToken.get(t)),
    create(name, data) {
      const id = randomUUID(), now = Date.now();
      q.insert.run(id, newToken(), name, JSON.stringify(data), now, now);
      return full(q.get.get(id));
    },
    save(id, name, data) {
      const r = q.update.run(name, JSON.stringify(data), Date.now(), id);
      return r.changes ? full(q.get.get(id)) : null;
    },
    rotateToken(id) {
      const t = newToken();
      return q.rotate.run(t, id).changes ? t : null;
    },
    remove: (id) => q.remove.run(id).changes > 0,
    close: () => db.close(),
  };
}
