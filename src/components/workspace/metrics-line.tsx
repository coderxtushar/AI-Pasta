import { cn } from "@/lib/utils";
import { formatMetrics } from "@/app/library/format";
import type { GenerateMetrics } from "@/app/library/stream";

/**
 * The full metric readout under an answer. Each item stays on one line, so the
 * readout only wraps between items, and two-line readouts are balanced.
 */
export function MetricsLine({ metrics, className }: { metrics: GenerateMetrics; className?: string }) {
  const parts = formatMetrics(metrics).split(" · ");
  return (
    <p className={cn("font-mono text-xs leading-5 text-balance text-muted-foreground tabular", className)}>
      {parts.map((part, i) => (
        <span key={i}>
          <span className="whitespace-nowrap">{part}</span>
          {i < parts.length - 1 && " · "}
        </span>
      ))}
    </p>
  );
}
