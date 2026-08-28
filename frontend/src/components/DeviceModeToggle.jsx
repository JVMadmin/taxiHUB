import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

// Pill Escritorio/App — para demostrar a los dueños cómo se ve en cada
// plataforma sin salir del navegador. "App" reutiliza los breakpoints
// responsive que ya existen en DuenoApp (lg:hidden / hidden lg:flex) vía
// un iframe con el ancho real de un teléfono: no duplica ningún layout,
// solo cambia el viewport que el navegador evalúa.
export function DeviceModeToggle({ mode, onChange }) {
  return (
    <div className="th-3d flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5" data-testid="device-mode-toggle">
      <button
        onClick={() => onChange("escritorio")}
        data-testid="device-mode-escritorio"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
          mode === "escritorio" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Monitor className="h-3.5 w-3.5" /> Escritorio
      </button>
      <button
        onClick={() => onChange("app")}
        data-testid="device-mode-app"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
          mode === "app" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Smartphone className="h-3.5 w-3.5" /> App
      </button>
    </div>
  );
}

export default DeviceModeToggle;
