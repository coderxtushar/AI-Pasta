"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Makes the hero's ↵ keycap true: pressing Enter on the landing page (with
 * nothing else focused) opens the workspace.
 */
export function EnterToStart() {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      e.preventDefault();
      // Press the hero's keycap so the shortcut visibly lands, then go.
      const cap = document.querySelector<HTMLElement>("[data-enter-kbd]");
      cap?.setAttribute("data-pressed", "");
      router.push("/app");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
