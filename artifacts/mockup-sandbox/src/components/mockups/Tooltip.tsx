import { useCallback, useEffect, useRef, useState } from "react";

import {
  Tooltip as SharedTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

export function Tooltip() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      element.dataset.refWired = "callback";
    }
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Tooltip</h1>
          <p className="text-sm text-muted-foreground">
            Tooltip content with callback and object refs.
          </p>
        </div>
        <TooltipProvider>
          <div className="flex gap-3 rounded-lg border p-4">
            <SharedTooltip open>
              <TooltipTrigger asChild>
                <button type="button">Callback ref trigger</button>
              </TooltipTrigger>
              <TooltipContent
                ref={setCallbackRef}
                data-testid="tooltip-callback-ref"
              >
                Callback ref content
              </TooltipContent>
            </SharedTooltip>
            <SharedTooltip open>
              <TooltipTrigger asChild>
                <button type="button">Object ref trigger</button>
              </TooltipTrigger>
              <TooltipContent ref={objectRef} data-testid="tooltip-object-ref">
                Object ref content
                <ObjectRefReporter
                  objectRef={objectRef}
                  onWired={setObjectRefWired}
                />
              </TooltipContent>
            </SharedTooltip>
          </div>
        </TooltipProvider>
        <output
          data-testid="tooltip-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}