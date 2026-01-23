import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="All in Guide">
      <span className="brandMark" aria-hidden="true" />
      <span>All in Guide</span>
    </Link>
  );
}
