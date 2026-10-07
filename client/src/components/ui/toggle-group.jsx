import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// A segmented control: `type="single"` with a required value behaves like radio buttons.
const ToggleGroup = ({ className, ...props }) => (
  <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('inline-flex w-fit items-center rounded-lg bg-muted p-0.5', className)} {...props} />
);
// `variant="tool"` is the toolbar look: a square icon button whose active state is a clear blue rounded square.
const ToggleGroupItem = ({ className, variant = 'segment', ...props }) => (
  <ToggleGroupPrimitive.Item data-slot="toggle-group-item"
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
      variant === 'tool'
        ? 'size-8 rounded-md hover:bg-card aria-checked:bg-primary/15 aria-checked:text-primary aria-checked:ring-1 aria-checked:ring-primary/60 aria-checked:hover:bg-primary/20'
        : 'h-7 min-w-8 flex-1 rounded-md px-2.5 text-xs font-medium aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm',
      className,
    )} {...props} />
);
export { ToggleGroup, ToggleGroupItem };
