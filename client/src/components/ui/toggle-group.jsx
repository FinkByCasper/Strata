import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// A segmented control: `type="single"` with a required value behaves like radio buttons.
const ToggleGroup = ({ className, ...props }) => (
  <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('inline-flex w-fit items-center rounded-lg bg-muted p-0.5', className)} {...props} />
);
const ToggleGroupItem = ({ className, ...props }) => (
  <ToggleGroupPrimitive.Item data-slot="toggle-group-item"
    className={cn('inline-flex h-7 min-w-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-4', className)} {...props} />
);
export { ToggleGroup, ToggleGroupItem };
