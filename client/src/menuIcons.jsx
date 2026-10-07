import React from 'react';
import { Orbit, RotateCcw, RotateCw, Scan } from 'lucide-react';

export const RotL = () => <RotateCcw className="size-4" />;
export const RotR = () => <RotateCw className="size-4" />;
export const Fit = () => <Scan className="size-4" />;
export const Reset = () => <Orbit className="size-4" />;
