import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    ref={ref} type={type} data-slot="input"
    className={cn(
      'h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground read-only:text-muted-foreground disabled:pointer-events-none disabled:opacity-50',
      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
export { Input };
