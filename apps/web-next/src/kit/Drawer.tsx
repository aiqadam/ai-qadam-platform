// L2 atom — Drawer (Radix-backed side panel).
//
// Same Radix Dialog primitive as <Dialog> (focus trap, ESC dismiss,
// ARIA, scroll lock) but the content is anchored to a screen edge and
// slides in, instead of centring. Used for filter panes + edit panels
// where a side sheet reads better than a centred modal (e.g. the
// Members cohort/filter panel, M2.3).
//
// Composition pattern:
//
//   <Drawer>
//     <DrawerTrigger asChild><Button>Filters</Button></DrawerTrigger>
//     <DrawerContent side="right">
//       <DrawerHeader>
//         <DrawerTitle>Filter members</DrawerTitle>
//         <DrawerDescription>Narrow the directory.</DrawerDescription>
//       </DrawerHeader>
//       {/* body */}
//       <DrawerFooter>
//         <Button variant="outline">Reset</Button>
//         <Button>Apply</Button>
//       </DrawerFooter>
//     </DrawerContent>
//   </Drawer>

'use client';

import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
  forwardRef,
} from 'react';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerPortal = DialogPrimitive.Portal;
export const DrawerClose = DialogPrimitive.Close;

export const DrawerOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

type DrawerSide = 'right' | 'left';

const SIDE_CLASS: Record<DrawerSide, string> = {
  right:
    'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
};

interface DrawerContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: DrawerSide;
}

export const DrawerContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = 'right', ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-300',
        SIDE_CLASS[side],
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5', className)} {...props} />;
}
DrawerHeader.displayName = 'DrawerHeader';

export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-auto flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className,
      )}
      {...props}
    />
  );
}
DrawerFooter.displayName = 'DrawerFooter';

export const DrawerTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DrawerTitle.displayName = 'DrawerTitle';

export const DrawerDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = 'DrawerDescription';
