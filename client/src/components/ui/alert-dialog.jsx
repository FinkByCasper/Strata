import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const AlertDialog = (props) => <AlertDialogPrimitive.Root {...props} />;

function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[300] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <AlertDialogPrimitive.Content
        className={cn('fixed top-1/2 left-1/2 z-[301] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-5 shadow-xl sm:max-w-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)} {...props} />
    </AlertDialogPrimitive.Portal>
  );
}
const AlertDialogHeader = ({ className, ...props }) => <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
const AlertDialogFooter = ({ className, ...props }) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
const AlertDialogTitle = ({ className, ...props }) => <AlertDialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
const AlertDialogDescription = ({ className, ...props }) => <AlertDialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
const AlertDialogAction = ({ className, variant = 'default', ...props }) => <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant }), className)} {...props} />;
const AlertDialogCancel = ({ className, ...props }) => <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />;

export { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel };
