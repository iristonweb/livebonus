import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import {
  Drawer as SharedDrawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

function ObjectRefReporter({
  objectRef,
  onWired,
}: {
  objectRef: { current: HTMLDivElement | null };
  onWired: (wired: boolean) => void;
}) {
  useEffect(() => {
    onWired(objectRef.current !== null);
  }, [objectRef, onWired]);

  return null;
}

export function Drawer() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [callbackRefWired, setCallbackRefWired] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<
    "callback" | "object" | undefined
  >();
  const setObjectRef = useCallback((element: HTMLDivElement | null) => {
    objectRef.current = element;
  }, []);

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    setCallbackRefWired(element !== null);
    if (element) element.dataset.refWired = "callback";
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Drawer</h1>
          <p className="text-sm text-muted-foreground">
            Bottom drawer content with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedDrawer
            open={openDrawer === "callback"}
            onOpenChange={(open) => setOpenDrawer(open ? "callback" : undefined)}
          >
            <DrawerTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </DrawerTrigger>
            <DrawerContent
              ref={setCallbackRef}
              data-testid="drawer-callback-ref"
            >
              <DrawerHeader>
                <DrawerTitle>Callback drawer</DrawerTitle>
                <DrawerDescription>
                  Content is rendered through a portal.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <DrawerClose asChild>
                  <button type="button">Close</button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </SharedDrawer>
          <SharedDrawer
            open={openDrawer === "object"}
            onOpenChange={(open) => setOpenDrawer(open ? "object" : undefined)}
          >
            <DrawerTrigger asChild>
              <button type="button">Object ref trigger</button>
            </DrawerTrigger>
            <DrawerContent
              ref={setObjectRef as unknown as Ref<never>}
              data-testid="drawer-object-ref"
            >
              <DrawerHeader>
                <DrawerTitle>Object drawer</DrawerTitle>
                <DrawerDescription>
                  The reporter runs after portal content mounts.
                </DrawerDescription>
                <ObjectRefReporter
                  objectRef={objectRef}
                  onWired={setObjectRefWired}
                />
              </DrawerHeader>
              <DrawerFooter>
                <DrawerClose asChild>
                  <button type="button">Close</button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </SharedDrawer>
        </div>
        <output
          data-testid="drawer-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="drawer-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}