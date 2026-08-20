import { cn } from "@/lib/utils";
import { Car } from "lucide-react";

// Identidad visual taxiHUB (Fase 9). El acento usa `brand` para respetar la
// paleta activa (esmeralda/oceano/ambar).
export function BrandMark({ className, size = "md" }) {
  const s = size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  const icon = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-brand",
        "shadow-[0_4px_16px_hsl(var(--brand)/0.35)]",
        s,
        className
      )}
    >
      <Car className={cn("text-brand-contrast", icon)} strokeWidth={2.4} />
    </div>
  );
}

export function BrandWordmark({ className, sub }) {
  return (
    <div className={cn("leading-none", className)}>
      <div className="text-[1.05rem] font-extrabold tracking-tight text-foreground">
        taxi<span className="text-brand-bright">HUB</span>
      </div>
      {sub && (
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

// Marca + palabra en una sola composición (headers de Terminal/Operador).
export function BrandLockup({ sub, className, markSize }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={markSize} />
      <BrandWordmark sub={sub} />
    </div>
  );
}