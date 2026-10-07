import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Label({ className, ...props }) {
  return <LabelPrimitive.Root data-slot="label" className={cn('flex items-center gap-2 text-xs leading-none font-medium select-none', className)} {...props} />;
}
export { Label };
