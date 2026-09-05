import { useCallback, useEffect, useRef, useState } from "react";

import {
  Sheet as SharedSheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

export function Sheet() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [callbackRefWired, setCallbackRefWired] = useState(false);
  const [openSheet, setOpenSheet] = useState<"callback" | "object" | undefined>();

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    setCallbackRefWired(element !== null);
    if (element) element.dataset.refWired = "callback";
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Sheet</h1>
          <p className="text-sm text-muted-foreground">
            Side sheet content with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedSheet
            open={openSheet === "callback"}
            onOpenChange={(open) => setOpenSheet(open ? "callback" : undefined)}
          >
            <SheetTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </SheetTrigger>
            <SheetContent
              ref={setCallbackRef}
              data-testid="sheet-callback-ref"
            >
              <SheetHeader>
                <SheetTitle>Callback sheet</SheetTitle>
                <SheetDescription>
                  Ref wiring is checked on the side panel.
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </SharedSheet>
          <SharedSheet
            open={openSheet === "object"}
            onOpenChange={(open) => setOpenSheet(open ? "object" : undefined)}
          >
            <SheetTrigger asChild>
              <button type="button">Object ref trigger</button>
            </SheetTrigger>
            <SheetContent ref={objectRef} data-testid="sheet-object-ref">
              <SheetHeader>
                <SheetTitle>Object sheet</SheetTitle>
                <SheetDescription>
                  The object ref is reported from the mounted sheet.
                </SheetDescription>
                <ObjectRefReporter
                  objectRef={objectRef}
                  onWired={setObjectRefWired}
                />
              </SheetHeader>
            </SheetContent>
          </SharedSheet>
        </div>
        <output
          data-testid="sheet-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="sheet-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}