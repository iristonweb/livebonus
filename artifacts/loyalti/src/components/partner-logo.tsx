import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type PartnerLogoProps = {
  name: string;
  logoUrl?: string | null;
  className?: string;
};

export function PartnerLogo({ name, logoUrl, className }: PartnerLogoProps) {
  const [hasError, setHasError] = useState(false);
  const normalizedLogoUrl = logoUrl?.trim() ?? "";
  const resolvedLogoUrl = normalizedLogoUrl.startsWith("/partner-logos/")
    ? `/api${normalizedLogoUrl}`
    : normalizedLogoUrl;

  useEffect(() => {
    setHasError(false);
  }, [normalizedLogoUrl]);

  if (!normalizedLogoUrl || hasError) {
    return (
      <span className={cn(className, "flex items-center justify-center font-bold")} aria-label={`${name} логотип`}>
        {name.trim().charAt(0) || "?"}
      </span>
    );
  }

  return (
    <img
      src={resolvedLogoUrl}
      alt={`${name} логотип`}
      className={cn(className, "object-contain bg-white")}
      onError={() => setHasError(true)}
    />
  );
}