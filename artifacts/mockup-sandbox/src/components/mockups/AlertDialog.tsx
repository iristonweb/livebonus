import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertDialog as SharedAlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

export function AlertDialog() {
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
          <h1 className="text-lg font-semibold">AlertDialog</h1>
          <p className="text-sm text-muted-foreground">
            Destructive confirmation with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedAlertDialog
            open={openDialog === "callback"}
            onOpenChange={(open) => setOpenDialog(open ? "callback" : undefined)}
          >
            <AlertDialogTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </AlertDialogTrigger>
            <AlertDialogContent
              ref={setCallbackRef}
              data-testid="alert-dialog-callback-ref"
            >
              <AlertDialogTitle>Remove this connection?</AlertDialogTitle>
              <AlertDialogDescription>
                This action requires confirmation before continuing.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </SharedAlertDialog>
          <SharedAlertDialog
            open={openDialog === "object"}
            onOpenChange={(open) => setOpenDialog(open ? "object" : undefined)}
          >
            <AlertDialogTrigger asChild>
              <button type="button">Object ref trigger</button>
            </AlertDialogTrigger>
            <AlertDialogContent
              ref={objectRef}
              data-testid="alert-dialog-object-ref"
            >
              <AlertDialogTitle>Review this action</AlertDialogTitle>
              <AlertDialogDescription>
                The object ref is reported from inside the portal content.
              </AlertDialogDescription>
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </SharedAlertDialog>
        </div>
        <output
          data-testid="alert-dialog-callback-ref-status"
          className="text-xs text-muted-foreground"
        >
          Callback ref: {callbackRefWired ? "wired" : "not wired"}
        </output>
        <output
          data-testid="alert-dialog-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}