import { useCallback, useEffect, useRef, useState } from "react";

import {
  Dialog as SharedDialog,
  DialogContent,
  DialogDescription,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function Dialog() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [callbackRefWired, setCallbackRefWired] = useState(false);
  const [openDialog, setOpenDialog] = useState<
    "callback" | "object" | undefined
  >();

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    setCallbackRefWired(element !== null);
    if (element) element.dataset.refWired = "callback";
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Dialog</h1>
          <p className="text-sm text-muted-foreground">
            Dialog content with callback and object refs.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <SharedDialog
            open={openDialog === "callback"}
            onOpenChange={(open) => setOpenDialog(open ? "callback" : undefined)}
          >
            <DialogTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </DialogTrigger>
            <DialogContent
              ref={setCallbackRef}
              data-testid="dialog-callback-ref"
            >
              <DialogTitle>Callback ref</DialogTitle>
              <DialogDescription>
                The callback ref reached the dialog content.
              </DialogDescription>
            </DialogContent>
          </SharedDialog>
          <SharedDialog
            open={openDialog === "object"}
            onOpenChange={(open) => setOpenDialog(open ? "object" : undefined)}
          >
            <DialogTrigger asChild>
              <button type="button">Object ref trigger</button>
            </DialogTrigger>
            <DialogContent ref={objectRef} data-testid="dialog-object-ref">
              <DialogTitle>Object ref</DialogTitle>
              <DialogDescription>
                The object ref reached the dialog content.
              </DialogDescription>
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </DialogContent>
          </SharedDialog>
        </div>
        <output
          data-testid="dialog-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="dialog-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}