import { cn } from "@/lib/utils";
import { Clock, LocateFixed } from "lucide-react";
import { BrandWordmark } from "@/components/Brand";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { Button } from "@/components/Button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { TerminalDisplayControls } from "@/components/TerminalDisplayControls";
import { PhoneCall, ClipboardList, LogOut, Car } from "@/design/icons";
import { INDICADORES } from "./indicadores";

const MARCH_LOGO = "/assets/vehicles/march.png";

/**
 * OpsTopbar — consola superior del Centro de Operaciones (Design System 2.0).
 * Identidad + sitio/reloj, contadores de flota (SSOT), acciones y perfil.
 * Integra los indicadores móviles compactos como segunda fila.
 */
export function OpsTopbar({
  termUser, logo, termFoto, onFotoClick, fotoInput, connected,
  counts, hora, serviciosOpen, onToggleServicios, onNuevaLlamada,
  uiAlpha, onAlphaChange, onLogout, children,
}) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 sm:p-4">
      <div className="bezel-shell pointer-events-auto">
        <div className="flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-1.5">
          {/* Identidad + estado del sistema */}
          <img src={MARCH_LOGO} alt="Marca" className="term-brand-logo" />
          <div className="hidden min-w-0 md:block">
            <BrandWordmark sub="Centro de operaciones" />
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground/85">
                <LocateFixed className="h-3 w-3 text-brand-bright" />
                Sitio: {termUser?.sitio_id ? termUser.sitio_id : "Principal"}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
                Sistema operativo
              </span>
              <span className="inline-flex items-center gap-1 font-mono mono-num text-foreground/85">
                <Clock className="h-3 w-3" /> {hora}
              </span>
            </div>
          </div>

          {/* Contadores de flota (desktop) */}
          <div className="mx-2 hidden h-9 w-px bg-border lg:block" />
          <div className="hidden items-center gap-4 lg:flex">
            {INDICADORES.map((i) => (
              <div key={i.estado} className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full" style={{ background: i.color }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: i.color }} />
                </span>
                <div className="leading-tight">
                  <div className="mono-num text-base font-bold" style={{ color: i.color }}>{counts[i.estado] || 0}</div>
                  <div className="text-[10px] text-muted-foreground">{i.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Acciones + perfil */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onToggleServicios}
              data-testid="servicios-tray-toggle"
              title="Servicios"
              aria-label="Servicios"
              className={cn("th-3d hidden h-10 w-10 items-center justify-center rounded-xl transition-colors lg:flex",
                serviciosOpen ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary/60")}
            >
              <ClipboardList className="th-icon-3d h-5 w-5" />
            </button>
            <Button data-testid="nueva-llamada-btn" onClick={onNuevaLlamada} size="sm" className="hidden lg:inline-flex">
              <PhoneCall className="th-icon-3d h-4 w-4" /> Nueva llamada
            </Button>
            <div className="hidden lg:contents">
              <ThemeSwitcher />
              <ModeToggle />
              <TerminalDisplayControls alpha={uiAlpha} onChange={onAlphaChange} />
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-2.5">
              <button
                onClick={onFotoClick}
                data-testid="term-foto-btn"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-brand/15"
                title="Cambiar foto"
              >
                {termFoto ? <img src={termFoto} alt="perfil" className="h-full w-full object-cover" />
                  : logo ? <img src={logo} alt="logo" className="h-full w-full object-contain p-0.5" />
                  : <Car className="h-5 w-5 text-brand-bright" />}
              </button>
              {fotoInput}
              <div className="hidden sm:block">
                <div className="text-sm font-bold leading-none text-foreground">{termUser?.nombre || "Operadora"}</div>
                <div className="mt-1.5">
                  <ConnectionBadge state={connected ? "online" : "reconnecting"} />
                </div>
              </div>
            </div>
            <button data-testid="terminal-logout" onClick={onLogout} title="Salir" aria-label="Salir" className="th-3d flex h-10 w-10 items-center justify-center rounded-xl text-foreground/80 hover:bg-secondary/60">
              <LogOut className="th-icon-3d h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Contadores compactos (móvil) */}
      <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto lg:hidden">
        {INDICADORES.map((i) => (
          <span key={i.estado} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card/85 px-2.5 py-1 text-[11px] text-foreground/85 ring-1 ring-border">
            <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
            <span className="mono-num font-bold" style={{ color: i.color }}>{counts[i.estado] || 0}</span>
            {i.label}
          </span>
        ))}
      </div>
      {children}
    </header>
  );
}

export default OpsTopbar;
