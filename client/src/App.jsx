import React, { useEffect, useState } from 'react';
import { Home } from './Home';
import { Editor } from './Editor';
import { Viewer } from './Viewer';
import { SignIn } from './SignIn';
import { useAuth } from './auth';

export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const Link = ({ to, children, ...rest }) => (
  <a href={to} onClick={(e) => { e.preventDefault(); navigate(to); }} {...rest}>{children}</a>
);

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const { ready, authEnabled, user } = useAuth();
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    const lost = () => useAuth.getState().lost();
    window.addEventListener('popstate', on);
    window.addEventListener('strata:signed-out', lost);
    useAuth.getState().refresh();
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('strata:signed-out', lost); };
  }, []);

  let m;
  const publicPage = /^\/(v|embed)\//.test(path);
  if (!publicPage) {
    if (!ready) return <div className="grid h-full place-content-center text-muted-foreground">Loading…</div>;
    if (authEnabled && !user) return <SignIn />;
  }
  if ((m = /^\/d\/([\w-]+)\/?$/.exec(path))) return <Editor key={m[1]} id={m[1]} />;
  if ((m = /^\/v\/([\w-]+)\/?$/.exec(path))) return <Viewer key={m[1]} token={m[1]} />;
  if ((m = /^\/embed\/([\w-]+)\/?$/.exec(path))) return <Viewer key={m[1]} token={m[1]} embed />;
  return <Home />;
}
