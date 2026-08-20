import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";

// Hermano de EmptyState/LoadingState: una petición fallida nunca debe dejar
// un panel vacío sin explicación ni forma de reintentar.
export function ErrorState({
  icon: Icon = AlertTriangle,
  title = "No se pudo cargar",
  description,
  onRetry,
  className,
  testId,
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center",
        className
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15">
        <Icon className="h-6 w-6 text-destructive" />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && (
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</div>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
          <RotateCw className="h-3.5 w-3.5" /> Reintentar
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
