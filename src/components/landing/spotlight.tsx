"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A surface whose edge catches light under the pointer (see `.spotlight` in
 * globals.css). Pointer position goes straight to CSS variables, no re-render.
 */
export function Spotlight({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      {...props}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
        el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      }}
      className={cn("spotlight", className)}
    >
      {children}
    </div>
  );
}
