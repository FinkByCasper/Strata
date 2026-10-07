import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = (props) => <DialogPrimitive.Root {...props} />;
const DialogTrigger = (props) => <DialogPrimitive.Trigger {...props} />;
const DialogClose = (props) => <DialogPrimitive.Close {...props} />;

function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content data-slot="dialog-content"
        className={cn('fixed top-1/2 left-1/2 z-[201] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-5 shadow-xl duration-150 outline-none sm:max-w-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground opacity-80 transition hover:bg-accent hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
          <X className="size-4" /><span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
const DialogHeader = ({ className, ...props }) => <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
const DialogFooter = ({ className, ...props }) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
const DialogTitle = ({ className, ...props }) => <DialogPrimitive.Title className={cn('text-lg leading-none font-semibold', className)} {...props} />;
const DialogDescription = ({ className, ...props }) => <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
