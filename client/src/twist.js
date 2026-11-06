// A twist is read from the angle between two fingers. A few degrees are ignored first, so that a plain pinch does not wobble the view.
export const TWIST_START = 0.12;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createTwist() {
  const fingers = new Map();
  let last = 0, turned = 0, active = false;
  const angle = () => { const [a, b] = [...fingers.values()]; return Math.atan2(b.y - a.y, b.x - a.x); };

  return {
    down(id, x, y) {
      fingers.set(id, { x, y });
      if (fingers.size === 2) { last = angle(); turned = 0; active = false; }
    },
    // Returns how far to turn since the last call (radians, clockwise positive), or 0.
    move(id, x, y) {
      if (!fingers.has(id)) return 0;
      fingers.set(id, { x, y });
      if (fingers.size !== 2) return 0;
      const now = angle();
      const step = wrap(now - last);
      last = now;
      turned += step;
      if (active) return step;
      if (Math.abs(turned) < TWIST_START) return 0;
      active = true;
      return turned;
    },
    up(id) {
      fingers.delete(id);
      active = false;
      turned = 0;
    },
  };
}
