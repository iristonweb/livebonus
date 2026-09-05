import { useCallback, useEffect, useRef, useState } from "react";

import {
  DropdownMenu as SharedDropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function DropdownMenu() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [openMenu, setOpenMenu] = useState<"callback" | "object" | undefined>();

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset.refWired = "callback";
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">DropdownMenu</h1>
          <p className="text-sm text-muted-foreground">
            Menu content with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedDropdownMenu
            open={openMenu === "callback"}
            onOpenChange={(open) => setOpenMenu(open ? "callback" : undefined)}
          >
            <DropdownMenuTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              ref={setCallbackRef}
              data-testid="dropdown-menu-callback-ref"
            >
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>Callback menu item</DropdownMenuItem>
            </DropdownMenuContent>
          </SharedDropdownMenu>
          <SharedDropdownMenu
            open={openMenu === "object"}
            onOpenChange={(open) => setOpenMenu(open ? "object" : undefined)}
          >
            <DropdownMenuTrigger asChild>
              <button type="button">Object ref trigger</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent ref={objectRef} data-testid="dropdown-menu-object-ref">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>Object menu item</DropdownMenuItem>
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </DropdownMenuContent>
          </SharedDropdownMenu>
        </div>
        <output
          data-testid="dropdown-menu-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}