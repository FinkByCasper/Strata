import React from 'react';
import { useStore } from './store';
import { StyleFields } from './ConnectorStyleFields';
import { hasLook, resolveStyle } from './connectorStyle.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// The look every connector in the diagram starts from. A connector can still override any of it in its own panel.
export function ConnectionStyle({ onClose }) {
  const defaults = useStore((s) => s.data.style?.connector);
  const overridden = useStore((s) => s.data.connectors.filter(hasLook).length);
  const set = useStore((s) => s.setConnectorDefaults);
  const reset = useStore((s) => s.resetConnectorDefaults);
  const clear = useStore((s) => s.clearConnectorLooks);
  const chosen = Object.keys(defaults ?? {}).length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connection style</DialogTitle>
          <DialogDescription>Arrow heads, line width and data-flow dots for every connector in this diagram. A connector can override any of it in its own panel.</DialogDescription>
        </DialogHeader>
        <StyleFields value={resolveStyle({}, defaults)} own={defaults ?? {}} onChange={set} />
        {overridden > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span>{overridden} connector{overridden === 1 ? ' has' : 's have'} a look of {overridden === 1 ? 'its' : 'their'} own.</span>
            <Button variant="outline" size="sm" onClick={clear}>Use these everywhere</Button>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" disabled={!chosen} onClick={reset}>Back to the built-in look</Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
