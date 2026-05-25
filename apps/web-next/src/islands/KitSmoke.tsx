// PR-0c smoke island — one instance of every atom in src/kit/.
//
// Lives under src/islands/ (not src/blocks/) on purpose: this is a
// throwaway harness, NOT an L3 block. Blocks must be catalogued in
// docs/architecture/blocks.md (arch-check Lock #4) and pulled from the
// catalogue by L4 pages. The kit-smoke island has no business showing
// up in the catalogue — it'll be deleted as soon as Storybook (PR-0e)
// lands.
//
// Tailwind-only styling (no inline style=). Every atom renders against
// the token theme so a quick visual scan confirms colors track the
// design-system tokens (and switching the html data-theme dark↔light
// re-themes everything).

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/kit';
import { useState } from 'react';

export default function KitSmoke() {
  const [open, setOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [country, setCountry] = useState<string>('');

  return (
    <ToastProvider>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Button</CardTitle>
            <CardDescription>Six variants × four sizes (default shown).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>

        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Single style; type= controls native behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Type here…" />
            <Input type="email" placeholder="email@aiqadam.org" />
            <Input disabled placeholder="Disabled" />
          </CardContent>
        </Card>

        {/* Badge */}
        <Card>
          <CardHeader>
            <CardTitle>Badge</CardTitle>
            <CardDescription>Five semantic variants.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Success</Badge>
          </CardContent>
        </Card>

        {/* Card */}
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>
              Compound: Header / Title / Description / Content / Footer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The card you're reading IS the Card atom. Recursive smoke-test.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">
              Footer action
            </Button>
          </CardFooter>
        </Card>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>Radix-backed; arrow keys + Home/End work.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <p className="text-sm text-muted-foreground">Overview tab content.</p>
              </TabsContent>
              <TabsContent value="details">
                <p className="text-sm text-muted-foreground">Details tab content.</p>
              </TabsContent>
              <TabsContent value="audit">
                <p className="text-sm text-muted-foreground">Audit tab content.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Select */}
        <Card>
          <CardHeader>
            <CardTitle>Select</CardTitle>
            <CardDescription>Radix combobox with typeahead.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uz">Uzbekistan</SelectItem>
                <SelectItem value="kz">Kazakhstan</SelectItem>
                <SelectItem value="tj">Tajikistan</SelectItem>
                <SelectItem value="xx">Cross-border</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Dialog */}
        <Card>
          <CardHeader>
            <CardTitle>Dialog</CardTitle>
            <CardDescription>Modal with focus trap + ESC dismiss.</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Test dialog</DialogTitle>
                  <DialogDescription>
                    Smoke-test of the Dialog atom. No real action wired.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setOpen(false)}>OK</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Toast */}
        <Card>
          <CardHeader>
            <CardTitle>Toast</CardTitle>
            <CardDescription>
              Radix primitives only — a full Toaster lands with L1 (PR-0d).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setToastOpen(true)}>Show toast</Button>
            <Toast open={toastOpen} onOpenChange={setToastOpen}>
              <div className="grid gap-1">
                <ToastTitle>Smoke-test toast</ToastTitle>
                <ToastDescription>This is the default variant.</ToastDescription>
              </div>
              <ToastClose />
            </Toast>
          </CardContent>
        </Card>
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
