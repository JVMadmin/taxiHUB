import { cn } from "@/lib/utils";
import { Car } from "lucide-react";

// Identidad visual taxiHUB (Fase 9). El acento usa `brand` para respetar la
// paleta activa (esmeralda/oceano/ambar/rubi/violeta) o color primario del sitio.
export function BrandMark({ className, size = "md", logoUrl = null }) {
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
      {logoUrl ? (
        <img src={logoUrl} alt="Logo del sitio" className="h-full w-full object-contain p-1" />
      ) : (
        <Car className={cn("text-brand-contrast", icon)} strokeWidth={2.4} />
      )}
    </div>
  );
}

export function BrandWordmark({ className, sub, title = null }) {
  return (
    <div className={cn("leading-none", className)}>
      <div className="text-[1.05rem] font-extrabold tracking-tight text-foreground">
        {title ? (
          <span>{title}</span>
        ) : (
          <>
            taxi<span className="text-brand-bright">HUB</span>
          </>
        )}
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
export function BrandLockup({ sub, className, markSize, logoUrl = null, title = null }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={markSize} logoUrl={logoUrl} />
      <BrandWordmark sub={sub} title={title} />
    </div>
  );
}