import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Hermano de EmptyState (mismo shape de props): nunca dejar una pantalla en
// blanco mientras se espera información. `rows` renderiza un esqueleto de
// lista sobre la clase .th-skeleton ya existente; sin `rows`, un spinner.
export function LoadingState({ title, description, className, testId, rows }) {
  if (rows) {
    return (
      <div data-testid={testId} className={cn("space-y-2", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-[52px] overflow-hidden rounded-xl border border-border/60">
            <div className="th-skeleton h-full" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center",
        className
      )}
    >
      <Loader2 className="mb-3 h-6 w-6 animate-spin text-muted-foreground" />
      {title && <div className="text-sm font-semibold text-foreground">{title}</div>}
      {description && (
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</div>
      )}
    </div>
  );
}

export default LoadingState;
