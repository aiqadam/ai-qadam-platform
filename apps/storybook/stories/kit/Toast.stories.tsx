import {
  Button,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

// Stories for the L2 atom `Toast` (apps/web-next/src/kit/Toast.tsx).
// The atom only exports the styled primitives — a real Toaster
// orchestration component arrives in PR-1.* (with a useToast hook).
// Stories here demonstrate the static rendered states, plus a small
// interactive harness that fires open/close so you can see the
// enter/exit animations.

const meta = {
  title: 'L2 Kit / Toast',
  component: Toast,
  tags: ['autodocs'],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <Toast open variant="default" className="static w-80 translate-x-0 translate-y-0">
        <div className="grid gap-1">
          <ToastTitle>Saved</ToastTitle>
          <ToastDescription>Your changes were saved successfully.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </ToastProvider>
  ),
};

export const Destructive: Story = {
  render: () => (
    <ToastProvider>
      <Toast open variant="destructive" className="static w-80 translate-x-0 translate-y-0">
        <div className="grid gap-1">
          <ToastTitle>Could not save</ToastTitle>
          <ToastDescription>The request failed. Please try again.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </ToastProvider>
  ),
};

export const Interactive: Story = {
  render: () => {
    function ToastDemo() {
      const [open, setOpen] = useState(false);
      return (
        <ToastProvider swipeDirection="right">
          <Button onClick={() => setOpen(true)}>Fire toast</Button>
          <Toast open={open} onOpenChange={setOpen}>
            <div className="grid gap-1">
              <ToastTitle>Event published</ToastTitle>
              <ToastDescription>
                The event is now visible to all signed-in members.
              </ToastDescription>
            </div>
            <ToastClose />
          </Toast>
          <ToastViewport />
        </ToastProvider>
      );
    }
    return <ToastDemo />;
  },
};
