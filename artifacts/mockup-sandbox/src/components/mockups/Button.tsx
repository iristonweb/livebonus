import { useCallback, useEffect, useRef, useState } from "react";

import { Button as SharedButton } from "@/components/ui/button";

export function Button() {
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
          <h1 className="text-lg font-semibold">Button</h1>
          <p className="text-sm text-muted-foreground">
            Buttons with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedButton
            ref={setCallbackRef}
            data-testid="button-callback-ref"
          >
            Callback ref
          </SharedButton>
          <SharedButton ref={objectRef} data-testid="button-object-ref">
            Object ref
          </SharedButton>
        </div>
        <output
          data-testid="button-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}