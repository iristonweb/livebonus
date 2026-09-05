import { useCallback, useEffect, useRef, useState } from "react";

import {
  Select as SharedSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Select() {
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
          <h1 className="text-lg font-semibold">Select</h1>
          <p className="text-sm text-muted-foreground">
            Select triggers with callback and object refs.
          </p>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <SharedSelect defaultValue="callback">
            <SelectTrigger
              ref={setCallbackRef}
              data-testid="select-callback-ref"
            >
              <SelectValue placeholder="Callback ref" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="callback">Callback ref</SelectItem>
            </SelectContent>
          </SharedSelect>
          <SharedSelect defaultValue="object">
            <SelectTrigger ref={objectRef} data-testid="select-object-ref">
              <SelectValue placeholder="Object ref" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="object">Object ref</SelectItem>
            </SelectContent>
          </SharedSelect>
        </div>
        <output
          data-testid="select-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}