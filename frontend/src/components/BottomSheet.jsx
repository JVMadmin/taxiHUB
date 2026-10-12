import { cn } from "@/lib/utils";

/**
 * BottomSheet — panel inferior anclado sobre el mapa, con handle y superficie
 * compartidos. Dos modos:
 *  - dismissible (default): modal real, con overlay que cierra al tocar fuera.
 *  - dismissible={false}: panel de estado persistente (p. ej. "tienes un
 *    servicio activo") — no hay overlay ni cierre por toque, porque no hay
 *    una acción de "cerrar" válida mientras ese estado sigue siendo cierto.
 */
export function BottomSheet({
  open = true,
  onOpenChange,
  children,
  className,
  testId,
  expanded = true,
  dismissible = true,
}) {
  if (!open) return null;
  return (
    <div
      data-testid={testId}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[520] flex justify-center"
      style={{ perspective: "1000px" }}
    >
      {dismissible && (
        <div
          className={cn(
            "pointer-events-auto fixed inset-0 bg-black/50 transition-opacity",
            expanded ? "opacity-100" : "opacity-0"
          )}
          onClick={() => onOpenChange?.(false)}
          aria-hidden="true"
        />
      )}
      <div
        role={dismissible ? "dialog" : undefined}
        aria-modal={dismissible ? "true" : undefined}
        className={cn(
          "pointer-events-auto relative w-full max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl animate-slide-up rounded-t-3xl border-x border-t border-border bg-background/95",
          "shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl",
          "max-h-[85vh] max-h-[85dvh] overflow-y-auto overscroll-contain",
          "pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]",
          className
        )}
      >
        <div className="mx-auto mt-2.5 flex w-12 justify-center">
          <span className="h-1 w-12 rounded-full bg-secondary" aria-hidden="true" />
        </div>
        <div className="px-4 sm:px-6 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}

export default BottomSheet;
