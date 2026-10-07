import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DropdownMenu = (props) => <DropdownMenuPrimitive.Root {...props} />;
const DropdownMenuTrigger = (props) => <DropdownMenuPrimitive.Trigger {...props} />;

function DropdownMenuContent({ className, sideOffset = 6, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} align="end"
        className={cn('z-[250] min-w-[12rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

const DropdownMenuItem = ({ className, inset, variant, ...props }) => (
  <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item"
    className={cn('relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*="text-"])]:text-muted-foreground',
      variant === 'destructive' && 'text-destructive focus:bg-destructive/10 [&_svg]:!text-destructive', inset && 'pl-8', className)} {...props} />
);

const DropdownMenuRadioGroup = (props) => <DropdownMenuPrimitive.RadioGroup {...props} />;
const DropdownMenuRadioItem = ({ className, children, ...props }) => (
  <DropdownMenuPrimitive.RadioItem
    className={cn('relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground', className)} {...props}>
    {children}
    <span className="absolute right-2 flex size-3.5 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Check className="size-4 !text-foreground" /></DropdownMenuPrimitive.ItemIndicator></span>
  </DropdownMenuPrimitive.RadioItem>
);

const DropdownMenuLabel = ({ className, ...props }) => <DropdownMenuPrimitive.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
const DropdownMenuSeparator = ({ className, ...props }) => <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
const DropdownMenuShortcut = ({ className, ...props }) => <span className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />;

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut };
