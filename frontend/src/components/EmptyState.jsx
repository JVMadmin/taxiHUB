import { cn } from "@/lib/utils";

// Estado vacío profesional (Fase 9): nunca un recuadro vacío sin explicación.
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
  testId,
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      {title && <div className="text-sm font-semibold text-foreground/85">{title}</div>}
      {description && (
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</div>
      )}
      {children}
    </div>
  );
}