import { create } from 'zustand';
import { DEFAULTS } from './embedOptions.js';

// Set once by the embed page. `active` is whether the viewer has clicked into the diagram: until then the page keeps its scroll.
export const useEmbed = create((set) => ({
  on: false,
  opts: DEFAULTS,
  pins: [],
  active: true,
  start: (opts, pins) => set({ on: true, opts, pins, active: opts.interact === 'always' }),
  setActive: (active) => set({ active }),
}));
