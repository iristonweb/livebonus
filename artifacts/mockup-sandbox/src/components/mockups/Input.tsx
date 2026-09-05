import { useCallback, useEffect, useRef, useState } from "react";

import { Input as SharedInput } from "@/components/ui/input";

export function Input() {
  const objectRef = useRef<HTMLInputElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);

  const setCallbackRef = useCallback((element: HTMLInputElement | null) => {
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
          <h1 className="text-lg font-semibold">Input</h1>
          <p className="text-sm text-muted-foreground">
            Inputs with callback and object refs.
          </p>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <SharedInput
            ref={setCallbackRef}
            data-testid="input-callback-ref"
            placeholder="Callback ref"
          />
          <SharedInput
            ref={objectRef}
            data-testid="input-object-ref"
            placeholder="Object ref"
          />
        </div>
        <output
          data-testid="input-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}