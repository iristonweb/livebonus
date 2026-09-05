import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ref, ...props }: React.ComponentProps<"svg">) {
  const setIconRef = React.useCallback(
    (element: SVGSVGElement | null) => {
      if (typeof ref === "function") {
        ref(element)
      } else if (ref) {
        ref.current = element
      }
    },
    [ref]
  )

  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      ref={ref ? setIconRef : undefined}
      {...props}
    />
  )
}

export { Spinner }
