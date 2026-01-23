import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "default" | "ghost";
  size?: "default" | "small";
  external?: boolean;
};

export function Button({ href, children, variant = "default", size = "default", external }: Props) {
  const className = [
    "btn",
    variant === "primary" ? "btnPrimary" : "",
    variant === "ghost" ? "btnGhost" : "",
    size === "small" ? "btnSmall" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
