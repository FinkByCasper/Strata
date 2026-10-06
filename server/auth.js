import { timingSafeEqual } from 'node:crypto';

// Optional password for the editor. Set STRATA_PASSWORD (and optionally STRATA_USER, default "strata") and the
// editor, the diagram list and the edit API ask for a login (HTTP Basic). Share links (/v/…), embeds (/embed/…)
// and their read-only API stay public, so they keep working for people you send them to.
const PUBLIC = [/^\/api\/shared\//, /^\/v\//, /^\/embed\//, /^\/assets\//, /^\/healthz$/, /^\/(logo|favicon)\.svg$/, /^\/apple-touch-icon\.png$/];

const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function requireLogin({ user = 'strata', password }) {
  if (!password) return (_req, _res, next) => next();
  return (req, res, next) => {
    if (PUBLIC.some((re) => re.test(req.path))) return next();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && token) {
      const raw = Buffer.from(token, 'base64').toString();
      const i = raw.indexOf(':');
      if (i >= 0 && same(raw.slice(0, i), user) && same(raw.slice(i + 1), password)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Strata", charset="UTF-8"').status(401).send('Login required');
  };
}
