import { useCallback, useEffect, useRef, useState } from "react";

import { Spinner as SharedSpinner } from "@/components/ui/spinner";

export function Spinner() {
  const objectRef = useRef<SVGSVGElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);

  const setCallbackRef = useCallback((element: SVGSVGElement | null) => {
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
          <h1 className="text-lg font-semibold">Spinner</h1>
          <p className="text-sm text-muted-foreground">
            Loading indicators with callback and object refs.
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-lg border p-4">
          <SharedSpinner
            ref={setCallbackRef}
            data-testid="spinner-callback-ref"
          />
          <SharedSpinner
            ref={objectRef}
            data-testid="spinner-object-ref"
          />
          <span className="text-sm">Loading preview content…</span>
        </div>
        <output
          data-testid="spinner-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}