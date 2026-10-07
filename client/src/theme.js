import { create } from 'zustand';

// Light / dark / follow-the-system. The choice is remembered in localStorage and applied as a `dark` class on <html>
// (a tiny script in index.html does the same before first paint so there is no flash). `dark` is the resolved value
// the 3D scene reads to pick its background, grid and shadow colours.
const KEY = 'strata.theme';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const read = () => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
};
const resolve = (theme) => (theme === 'system' ? !!mq?.matches : theme === 'dark');
const apply = (dark) => {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
};

export const useTheme = create((set, get) => {
  const theme = read();
  const dark = resolve(theme);
  if (typeof document !== 'undefined') apply(dark);
  mq?.addEventListener?.('change', () => {
    if (get().theme !== 'system') return;
    const d = resolve('system');
    apply(d); set({ dark: d });
  });
  return {
    theme, dark,
    setTheme: (t) => {
      try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* ignore */ }
      const d = resolve(t);
      apply(d); set({ theme: t, dark: d });
    },
  };
});
