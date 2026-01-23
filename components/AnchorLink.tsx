import Link from "next/link";
import type { ReactNode } from "react";

export function AnchorLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="navLink">
      {children}
    </Link>
  );
}
