"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/** Top-bar links. The current section's highlight slides between links as you navigate. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  const activeHref = items.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.href;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !link) {
      setPill(null);
      return;
    }
    // The first placement jumps into position; later ones slide.
    setPill((prev) => ({ x: link.offsetLeft, w: link.offsetWidth, ready: prev !== null }));
  }, [activeHref, items.length]);

  return (
    <nav ref={navRef} aria-label="Main" className="relative hidden items-center gap-1 sm:flex">
      {pill && (
        <span
          aria-hidden
          className={cn(
            "nav-pill absolute top-1/2 left-0 h-8 rounded-md bg-accent",
            pill.ready && "transition-[transform,width] duration-500 ease-out-expo"
          )}
          style={{ width: pill.w, transform: `translate(${pill.x}px, -50%)` }}
        />
      )}
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-2.5 py-1.5 text-sm transition-colors duration-200",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
