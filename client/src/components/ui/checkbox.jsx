import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox"
      className={cn('peer size-4 shrink-0 rounded-[4px] border border-input bg-card shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground disabled:opacity-50', className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current"><Check className="size-3.5" strokeWidth={3} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export { Checkbox };
