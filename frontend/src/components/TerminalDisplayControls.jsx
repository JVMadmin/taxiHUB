import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Settings2, MonitorSmartphone } from "lucide-react";

/**
 * TerminalDisplayControls — ajustes visuales en vivo del dispatcher:
 * transparencia de la interfaz (slider) aplicada por CSS var `--ui-alpha`.
 */
export function TerminalDisplayControls({ alpha, onChange }) {
  const pct = Math.round(alpha * 100);
  return (
    <Popover>
      <PopoverTrigger
        data-testid="terminal-ui-controls"
        title="Ajustes de pantalla"
        className="th-3d flex h-10 w-10 items-center justify-center rounded-xl text-foreground/80 transition-colors hover:bg-secondary"
      >
        <Settings2 className="th-icon-3d h-5 w-5" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 border-border text-popover-foreground" style={{ background: "hsl(240 5% 9% / var(--ui-alpha,0.95))" }}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
              <MonitorSmartphone className="h-4 w-4 text-brand-bright" />
            </span>
            <div>
              <div className="text-sm font-bold text-foreground">Ajustes de pantalla</div>
              <div className="text-[11px] text-muted-foreground">Aplica en vivo al dispatcher</div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="term-ui-alpha" className="text-xs font-semibold text-foreground/90">
                Transparencia de la interfaz
              </label>
              <span className="mono-num rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-foreground">{pct}%</span>
            </div>
            <Slider
              id="term-ui-alpha"
              data-testid="terminal-ui-opacity"
              min={40}
              max={95}
              step={5}
              value={[pct]}
              onValueChange={([v]) => onChange(v / 100)}
              className="mt-2"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Más bajo = más transparente. Los paneles y popups del mapa responden en vivo.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TerminalDisplayControls;