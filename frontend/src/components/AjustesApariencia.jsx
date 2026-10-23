import { useState } from "react";
import { Check, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { THEME_LIST, applyTheme, getTheme } from "@/lib/theme";

/**
 * Ajustes de apariencia (panel del socio): paleta de color y transparencia de los paneles.
 * La paleta elegida aquí gana sobre la del sitio (applyTheme con porUsuario).
 * `alpha`/`onAlpha` controlan la variable CSS --ui-alpha del contenedor que la use.
 */
export function AjustesApariencia({ alpha, onAlpha, compact = false }) {
  const [tema, setTema] = useState(getTheme());
  const pct = Math.round((alpha ?? 1) * 100);
  const elegir = (id) => {
    applyTheme(id, { porUsuario: true });
    setTema(id);
  };
  return (
    <Popover>
      <PopoverTrigger
        data-testid="ajustes-apariencia-btn"
        title="Ajustes de apariencia"
        aria-label="Ajustes de apariencia"
        className={compact ? "th-3d flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80" : "th-3d flex h-10 w-10 items-center justify-center rounded-xl text-foreground/80"}
      >
        <Settings className={compact ? "th-icon-3d h-4 w-4" : "th-icon-3d h-5 w-5"} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="z-[1200] w-72 border-border bg-popover text-popover-foreground" data-testid="ajustes-apariencia-panel">
        <div className="text-sm font-bold text-foreground">Apariencia</div>
        <div className="mt-3 text-xs font-semibold text-foreground/90">Paleta de color</div>
        <div className="mt-2 grid gap-1" role="radiogroup" aria-label="Paleta de color">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tema === t.id}
              data-testid={`theme-${t.id}`}
              onClick={() => elegir(t.id)}
              className="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-2 text-sm text-foreground/90 transition-colors hover:bg-secondary aria-checked:bg-secondary"
            >
              <span className="h-4 w-4 rounded-full border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]" style={{ background: t.swatch }} />
              <span className="flex-1 text-left">{t.label}</span>
              {tema === t.id && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>

        {onAlpha && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="ajuste-alpha" className="text-xs font-semibold text-foreground/90">Transparencia de paneles</label>
              <span className="mono-num rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-foreground">{pct}%</span>
            </div>
            <Slider
              id="ajuste-alpha"
              data-testid="ajuste-opacidad"
              min={40}
              max={100}
              step={5}
              value={[pct]}
              onValueChange={([v]) => onAlpha(v / 100)}
              className="mt-2"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Más bajo = paneles más transparentes. Se guarda en este equipo.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AjustesApariencia;
