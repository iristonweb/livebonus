import { useCallback, useEffect, useRef, useState } from "react";

import {
  HoverCard as SharedHoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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

export function HoverCard() {
  const objectRef = useRef<HTMLDivElement>(null);
  const [objectRefWired, setObjectRefWired] = useState(false);
  const [openCard, setOpenCard] = useState<"callback" | "object" | undefined>();

  const setCallbackRef = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset.refWired = "callback";
  }, []);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-lg font-semibold">HoverCard</h1>
          <p className="text-sm text-muted-foreground">
            Hover card content with callback and object refs.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border p-4">
          <SharedHoverCard
            open={openCard === "callback"}
            onOpenChange={(open) => setOpenCard(open ? "callback" : undefined)}
          >
            <HoverCardTrigger asChild>
              <button type="button">Callback ref trigger</button>
            </HoverCardTrigger>
            <HoverCardContent
              ref={setCallbackRef}
              data-testid="hover-card-callback-ref"
            >
              Callback ref content
            </HoverCardContent>
          </SharedHoverCard>
          <SharedHoverCard
            open={openCard === "object"}
            onOpenChange={(open) => setOpenCard(open ? "object" : undefined)}
          >
            <HoverCardTrigger asChild>
              <button type="button">Object ref trigger</button>
            </HoverCardTrigger>
            <HoverCardContent ref={objectRef} data-testid="hover-card-object-ref">
              Object ref content
              <ObjectRefReporter
                objectRef={objectRef}
                onWired={setObjectRefWired}
              />
            </HoverCardContent>
          </SharedHoverCard>
        </div>
        <output
          data-testid="hover-card-object-ref-status"
          className="text-xs text-muted-foreground"
        >
          Object ref: {objectRefWired ? "wired" : "not wired"}
        </output>
      </div>
    </main>
  );
}