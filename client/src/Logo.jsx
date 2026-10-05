import React from 'react';
import { paths } from './logo-paths.json';

// The Strata mark: three stacked isometric slabs (strata = layers). Same geometry as public/logo.svg.
export function Logo({ size = 24, title = 'Strata' }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={title} className="logo-mark">
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.fill} strokeWidth="1.4" strokeLinejoin="round" />)}
      <circle cx="32" cy="16" r="2.6" fill="#fff" fillOpacity="0.95" />
    </svg>
  );
}
