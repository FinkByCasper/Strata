import React, { useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { useTheme } from './theme';
import { FloorText } from './FloorText';
import { additive } from './nodes';
import { useHoldMove } from './hold';
import { groupContents } from './selection.js';
import { DEFAULT_COLOR, placeOf } from './textLabels.js';

const PRIMARY = '#4f8cff';
const LIFT = 0.05;
const snapHalf = (v, _axis, snap) => (snap ? Math.round(v * 2) / 2 : Math.round(v * 20) / 20);

// Where a label is, as a string so the label only redraws when it really moved (an object would look new every time).
const useSpot = (label) => useStore((s) => placeOf(label, s.data).join(','));

function LabelView({ label }) {
  const dark = useTheme((s) => s.dark);
  const selected = useStore((s) => s.picked.label.has(label.id));
  const editable = useStore((s) => !s.readOnly);
  const [x, z] = useSpot(label).split(',').map(Number);
  const [hovered, setHovered] = useState(false);
  const carry = useRef(null);
  const grouped = useRef(false);
  const hold = useHoldMove(
    () => { const [px, pz] = placeOf(label, useStore.getState().data); return [px, 0, pz]; },
    (nx, nz) => {
      const st = useStore.getState();
      if (grouped.current) st.moveGroup({ type: 'label', id: label.id }, nx, nz, carry.current);
      else st.moveLabel(label.id, nx, nz);
    },
    snapHalf,
  );

  const down = (e) => {
    const s = useStore.getState();
    if (s.readOnly || s.mode !== 'select' || e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    if (additive(e.nativeEvent)) { s.toggleSelect({ type: 'label', id: label.id }); return; }
    const inGroup = s.multi.length > 1 && s.picked.label.has(label.id);
    if (!inGroup) s.select({ type: 'label', id: label.id });
    grouped.current = inGroup;
    carry.current = inGroup ? groupContents(s.data, s.picked) : null;
    hold.start(e);
  };

  const text = label.text || (editable ? 'Text' : '');
  if (!text) return null;
  const color = label.color || (dark ? DEFAULT_COLOR.dark : DEFAULT_COLOR.light);
  const handlers = editable
    ? { onPointerDown: down, onPointerMove: hold.move, onPointerOver: () => setHovered(true), onPointerOut: () => setHovered(false) }
    : null;
  return (
    <group position={[x, hold.lifted ? 0.35 : LIFT, z]} rotation={[0, -((label.rotation ?? 0) * Math.PI) / 180, 0]}>
      <FloorText text={text} color={color} shade={1} maxHeight={0.85 * (label.size ?? 1)} opacity={label.text ? 1 : 0.35}
        outline={selected ? PRIMARY : hovered || hold.lifted ? `${color}` : undefined} meshProps={handlers ?? undefined} />
    </group>
  );
}

export function TextLabels() {
  const labels = useStore((s) => s.data.labels);
  return useMemo(() => labels.map((l) => <LabelView key={l.id} label={l} />), [labels]);
}
