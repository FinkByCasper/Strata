import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const TooltipProvider = ({ delayDuration = 350, ...props }) => <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
const Tooltip = (props) => <TooltipPrimitive.Root {...props} />;
const TooltipTrigger = (props) => <TooltipPrimitive.Trigger {...props} />;

function TooltipContent({ className, sideOffset = 6, children, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={sideOffset}
        className={cn('z-[300] w-fit rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)} {...props}>
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

// Convenience: <Hint label="Undo" keys="Ctrl+Z"><Button/></Hint>
function Hint({ label, keys, side = 'bottom', children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}{keys && <kbd className="ml-2 rounded bg-background/20 px-1 font-sans text-[10px] opacity-80">{keys}</kbd>}</TooltipContent>
    </Tooltip>
  );
}
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint };
