import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

// Text drawn onto a flat plane lying on the floor (no font files needed: it is painted on a canvas).
// Reads along +x with its top toward -z, like the zone titles in isometric network diagrams.
// Several lines (split on newlines) stack downwards. `shade` darkens the colour (zone names sit on a tinted floor, free text does not);
// `outline` draws a frame around the text, and `meshProps` go to the plane, which only takes part in picking when it has a handler.
export function FloorText({ text, color, maxWidth = Infinity, maxHeight = 0.85, opacity = 1, shade = 0.45, outline, meshProps }) {
  const rows = useMemo(() => String(text).split('\n'), [text]);
  const { tex, aspect } = useMemo(() => {
    const px = 96, pad = 20, rowHeight = Math.round(px * 1.4);
    const font = `italic 800 ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    const widest = Math.max(...rows.map((r) => g.measureText(r).width));
    c.width = Math.min(4096, Math.ceil(widest) + pad * 2);
    c.height = rowHeight * rows.length;
    g.font = font; g.textBaseline = 'middle'; g.fillStyle = new THREE.Color(color).multiplyScalar(shade).getStyle();
    rows.forEach((row, i) => g.fillText(row, pad, rowHeight * (i + 0.5) + 2, c.width - pad * 2));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return { tex: t, aspect: c.width / c.height };
  }, [rows, color, shade]);
  useEffect(() => () => tex.dispose(), [tex]);
  const height = Math.min(maxHeight * rows.length, maxWidth / aspect); // shrink to fit if the space is short
  const width = height * aspect;
  const frame = useMemo(() => [[-width / 2, 0, -height / 2], [width / 2, 0, -height / 2], [width / 2, 0, height / 2], [-width / 2, 0, height / 2], [-width / 2, 0, -height / 2]], [width, height]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} {...(meshProps ?? { raycast: () => null })}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      {outline && <Line points={frame} color={outline} lineWidth={1.5} position={[0, 0.01, 0]} raycast={() => null} />}
    </>
  );
}
