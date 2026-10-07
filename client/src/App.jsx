import React, { useEffect, useState } from 'react';
import { Home } from './Home';
import { Editor } from './Editor';
import { Viewer } from './Viewer';

export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const Link = ({ to, children, ...rest }) => (
  <a href={to} onClick={(e) => { e.preventDefault(); navigate(to); }} {...rest}>{children}</a>
);

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  let m;
  if ((m = /^\/d\/([\w-]+)\/?$/.exec(path))) return <Editor key={m[1]} id={m[1]} />;
  if ((m = /^\/v\/([\w-]+)\/?$/.exec(path))) return <Viewer key={m[1]} token={m[1]} />;
  if ((m = /^\/embed\/([\w-]+)\/?$/.exec(path))) return <Viewer key={m[1]} token={m[1]} embed />;
  return <Home />;
}
