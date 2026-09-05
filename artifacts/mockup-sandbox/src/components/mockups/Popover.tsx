import { useCallback, useEffect, useRef, useState } from "react";

import {
  Popover as SharedPopover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

export function Popover() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [openPopover, setOpenPopover] = useState<
    "callback" | "object" | undefined
  >();

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      element.dataset.refWired = "callback";
    }
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Popover</h1>
          <p className="text-sm text-muted-foreground">
            Popover content with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedPopover
            open={openPopover === "callback"}
            onOpenChange={(open) =>
              setOpenPopover(open ? "callback" : undefined)
            }
          >
            <PopoverTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </PopoverTrigger>
            <PopoverContent
              ref={setCallbackRef}
              data-testid="popover-callback-ref"
            >
              Callback ref content
            </PopoverContent>
          </SharedPopover>
          <SharedPopover
            open={openPopover === "object"}
            onOpenChange={(open) =>
              setOpenPopover(open ? "object" : undefined)
            }
          >
            <PopoverTrigger asChild>
              <button type="button">Object ref trigger</button>
            </PopoverTrigger>
            <PopoverContent ref={objectRef} data-testid="popover-object-ref">
              Object ref content
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </PopoverContent>
          </SharedPopover>
        </div>
        <output
          data-testid="popover-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}