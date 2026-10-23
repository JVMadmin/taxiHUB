import { useMode } from "@/hooks/useMode";
import { applyMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";

// Botón de modo día/noche. Muestra la acción: en modo noche, un sol amarillo
// ("cambiar a modo día"); en modo día, una luna ("cambiar a modo noche").
// `claro`/`onToggle` permiten usarlo con un estado propio (app del chofer).
export function ModeToggle({ compact = false, claro: claroProp, onToggle, className }) {
  const mode = useMode();
  const claro = claroProp ?? mode === "claro";
  const titulo = claro ? "Cambiar a modo noche" : "Cambiar a modo día";
  const icono = compact ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      data-testid="mode-toggle"
      onClick={() => (onToggle ? onToggle() : applyMode(claro ? "oscuro" : "claro"))}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "th-3d th-modo flex items-center justify-center",
        compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl",
        className
      )}
      data-claro={claro}
    >
      {claro ? (
        <Moon className={cn("th-icon-3d", icono)} />
      ) : (
        <Sun className={cn("th-modo-sol", icono)} strokeWidth={2.2} />
      )}
    </button>
  );
}
