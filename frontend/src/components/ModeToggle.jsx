import { useMode } from "@/hooks/useMode";
import { applyMode } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

// Botón sol/luna: cambia entre modo claro (día) y oscuro (noche).
// En claro muestra el sol; en oscuro, la luna.
export function ModeToggle() {
  const mode = useMode();
  const claro = mode === "claro";
  return (
    <button
      data-testid="mode-toggle"
      onClick={() => applyMode(claro ? "oscuro" : "claro")}
      title={claro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      aria-label={claro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      className="th-3d flex h-10 w-10 items-center justify-center rounded-xl text-foreground/80 hover:bg-secondary"
    >
      {claro ? (
        <Sun className="th-icon-3d h-5 w-5 text-amber-500" />
      ) : (
        <Moon className="th-icon-3d h-5 w-5" />
      )}
    </button>
  );
}