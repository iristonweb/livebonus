import { useCallback, useEffect, useRef, useState } from "react";

import {
  Menubar as SharedMenubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";

function ObjectRefReporter({
  objectRef,
  onWired,
}: {
  objectRef: { current: HTMLDivElement | null };
  onWired: (wired: boolean) => void;
}) {
  useEffect(() => {
    onWired(objectRef.current !== null);

    return () => onWired(false);
  }, [objectRef, onWired]);

  return null;
}

export function Menubar() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [callbackRefWired, setCallbackRefWired] = useState(false);
  const [objectRefWired, setObjectRefWired] = useState(false);

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    setCallbackRefWired(element !== null);

    if (element) {
      element.dataset.refWired = "callback";
    }
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Menubar</h1>
          <p className="text-sm text-muted-foreground">
            Menubar content with callback and object refs.
          </p>
        </div>
        <SharedMenubar>
          <MenubarMenu>
            <MenubarTrigger>Callback ref trigger</MenubarTrigger>
            <MenubarContent
              ref={setCallbackRef}
              data-testid="menubar-callback-ref"
            >
              <MenubarLabel>Actions</MenubarLabel>
              <MenubarItem>Callback menu item</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Object ref trigger</MenubarTrigger>
            <MenubarContent ref={objectRef} data-testid="menubar-object-ref">
              <MenubarLabel>Actions</MenubarLabel>
              <MenubarItem>Object menu item</MenubarItem>
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </MenubarContent>
          </MenubarMenu>
        </SharedMenubar>
        <output
          data-testid="menubar-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="menubar-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}