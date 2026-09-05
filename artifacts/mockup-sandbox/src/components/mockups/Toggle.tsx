import { useCallback, useEffect, useRef, useState } from "react";

import { Toggle as SharedToggle } from "@/components/ui/toggle";

export function Toggle() {
  const objectRef = useRef<HTMLButtonElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);

  const setCallbackRef = useCallback((element: HTMLButtonElement | null) => {
    if (element) {
      element.dataset.refWired = "callback";
    }
  }, []);

  useEffect(() => {
    setObjectRefWired(objectRef.current !== null);
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Toggle</h1>
          <p className="text-sm text-muted-foreground">
            Toggles with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedToggle ref={setCallbackRef} data-testid="toggle-callback-ref">
            Callback ref
          </SharedToggle>
          <SharedToggle ref={objectRef} data-testid="toggle-object-ref">
            Object ref
          </SharedToggle>
        </div>
        <output
          data-testid="toggle-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}