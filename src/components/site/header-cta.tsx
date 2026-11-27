"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/** "Start comparing" in the top bar, everywhere except the workspace itself. */
export function HeaderCta() {
  const pathname = usePathname();
  if (pathname.startsWith("/app")) return null;
  return (
    <Button asChild size="sm" className="ml-1 hidden sm:inline-flex">
      <Link href="/app">Start comparing</Link>
    </Button>
  );
}
