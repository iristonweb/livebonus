import { useCallback, useEffect, useRef, useState } from "react";

import {
  ContextMenu as SharedContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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

export function ContextMenu() {
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
          <h1 className="text-lg font-semibold">ContextMenu</h1>
          <p className="text-sm text-muted-foreground">
            Context menu content with callback and object refs.
          </p>
        </div>
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <SharedContextMenu>
            <ContextMenuTrigger asChild>
              <button type="button">Callback ref target</button>
            </ContextMenuTrigger>
            <ContextMenuContent
              ref={setCallbackRef}
              data-testid="context-menu-callback-ref"
            >
              <ContextMenuLabel>Actions</ContextMenuLabel>
              <ContextMenuItem>Callback menu item</ContextMenuItem>
            </ContextMenuContent>
          </SharedContextMenu>
          <SharedContextMenu>
            <ContextMenuTrigger asChild>
              <button type="button">Object ref target</button>
            </ContextMenuTrigger>
            <ContextMenuContent ref={objectRef} data-testid="context-menu-object-ref">
              <ContextMenuLabel>Actions</ContextMenuLabel>
              <ContextMenuItem>Object menu item</ContextMenuItem>
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </ContextMenuContent>
          </SharedContextMenu>
        </div>
        <output
          data-testid="context-menu-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="context-menu-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}