// L2 atom — Tabs (Radix-backed).
//
// Re-exports Radix's `Tabs.Root`, plus styled `List`, `Trigger`, `Content`.
// Radix handles all of: roving tabindex, ARIA roles, keyboard nav
// (ArrowLeft/Right/Home/End), automatic content swap. We add only the
// visual layer that binds to the token theme.
//
// Composition pattern:
//
//   <Tabs defaultValue="overview">
//     <TabsList>
//       <TabsTrigger value="overview">Overview</TabsTrigger>
//       <TabsTrigger value="forum">Forum</TabsTrigger>
//     </TabsList>
//     <TabsContent value="overview">...</TabsContent>
//     <TabsContent value="forum">...</TabsContent>
//   </Tabs>

'use client';

import { cn } from '@/lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from 'react';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ComponentRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = forwardRef<
  ComponentRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = forwardRef<
  ComponentRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
