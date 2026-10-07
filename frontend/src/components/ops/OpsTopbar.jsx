import { useState, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { Clock, LocateFixed, ShieldCheck, Megaphone, X } from "lucide-react";
import { BrandWordmark } from "@/components/Brand";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { Button } from "@/components/Button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { TerminalDisplayControls } from "@/components/TerminalDisplayControls";
import { PhoneCall, ClipboardList, LogOut, Car } from "@/design/icons";
import { INDICADORES } from "./indicadores";

const MARCH_LOGO = "/assets/vehicles/march.png";

/** Reloj aislado: se actualiza cada segundo sin provocar re-render de Terminal ni del mapa */
const LiveClock = memo(function LiveClock({ initialHora }) {
  const [hora, setHora] = useState(
    () =>
      initialHora ||
      new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
  );
  useEffect(() => {
    const tick = () =>
      setHora(
        new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1 font-mono mono-num text-foreground/85">
      <Clock className="h-3 w-3" /> {hora}
    </span>
  );
});

/**
 * OpsTopbar — consola superior del Centro de Operaciones (Design System 2.0).
 * Identidad + sitio/reloj, contadores de flota (SSOT), acciones y perfil.
 * Integra los indicadores móviles compactos como segunda fila.
 */
export const OpsTopbar = memo(function OpsTopbar({
  termUser, logo, sitioConfig, termFoto, onFotoClick, fotoInput, connected,
  counts, hora, serviciosOpen, onToggleServicios, onNuevaLlamada,
  uiAlpha, onAlphaChange, onLogout, avisosActivos = [], children,
}) {
  const [dismissedAvisoId, setDismissedAvisoId] = useState(null);
  const brandLogo = logo || MARCH_LOGO;
  const brandTitle = sitioConfig?.nombre || "CENTRAL DE TAXIS";
  const brandSub = sitioConfig?.subtitulo || "Centro de operaciones";
  const sitioLabel = sitioConfig?.nombre || (termUser?.sitio_id ? termUser.sitio_id : "Principal");
  const sub = sitioConfig?.suscripcion || null;
  const subDays = sub?.dias_restantes ?? 26;
  const subTone =
    subDays <= 3
      ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
      : subDays <= 7
        ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";

  const avisoVisible = (avisosActivos || []).find((a) => a.id !== dismissedAvisoId);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-1.5 p-2.5 sm:p-3">
      {avisoVisible && (
        <div
          data-testid="terminal-dev-aviso-banner"
          className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-indigo-400/40 bg-[#141829]/95 px-3 py-1.5 text-xs text-indigo-100 shadow-lg backdrop-blur-md"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="font-bold text-white">{avisoVisible.titulo || "Aviso de Soporte SaaS"}:</span>
            <span className="truncate text-indigo-100/90">{avisoVisible.mensaje}</span>
            {avisoVisible.contacto_soporte && (
              <span className="hidden rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300 xl:inline-block">
                {avisoVisible.contacto_soporte}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDismissedAvisoId(avisoVisible.id)}
            className="shrink-0 rounded-lg p-1 text-indigo-200/70 hover:bg-white/10 hover:text-white"
            title="Ocultar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="bezel-shell pointer-events-auto">
        <div className="flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5">
          {/* Identidad + estado del sistema */}
          <img
            src={brandLogo}
            alt="Marca"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = MARCH_LOGO;
            }}
            className="term-brand-logo object-contain"
          />
          <div className="hidden min-w-0 md:block">
            <BrandWordmark title={brandTitle} sub={brandSub} />
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground/85" data-testid="terminal-sitio-badge">
                <LocateFixed className="h-3 w-3 text-brand-bright" />
                Sitio: {sitioLabel}
              </span>
              <span
                data-testid="terminal-suscripcion-restante"
                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", subTone)}
                title={`Plan: ${sub?.plan || "Central Satelital Pro"} · Vence: ${sub?.vence_en?.slice(0, 10) || "Activo"}`}
              >
                <ShieldCheck className="h-3 w-3" />
                Licencia: {sub?.etiqueta_restante || `${subDays} días restantes`}
              </span>
              <LiveClock initialHora={hora} />
            </div>
          </div>

          {/* Contadores de flota (desktop) */}
          <div className="mx-1.5 hidden h-8 w-px bg-border lg:block" />
          <div className="hidden items-center gap-3.5 lg:flex">
            {INDICADORES.map((i) => (
              <div key={i.estado} className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full" style={{ background: i.color }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: i.color }} />
                </span>
                <div className="leading-tight">
                  <div className="mono-num text-sm font-bold" style={{ color: i.color }}>{counts[i.estado] || 0}</div>
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
              title="Servicios de hoy"
              aria-label="Servicios"
              className={cn("th-3d hidden h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors lg:flex",
                serviciosOpen ? "bg-[#4F5DFF] text-white shadow-[0_2px_10px_rgba(79,93,255,0.3)]" : "border border-white/10 bg-white/[0.04] text-foreground/90 hover:bg-white/[0.1]")}
            >
              <ClipboardList className="th-icon-3d h-4 w-4" />
              <span>Servicios</span>
            </button>
            <Button data-testid="nueva-llamada-btn" onClick={onNuevaLlamada} size="sm" className="hidden lg:inline-flex">
              <PhoneCall className="th-icon-3d h-4 w-4" /> Nueva llamada
            </Button>
            <div className="hidden lg:contents">
              <ThemeSwitcher />
              <ModeToggle />
              <TerminalDisplayControls alpha={uiAlpha} onChange={onAlphaChange} />
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-2">
              <button
                onClick={onFotoClick}
                data-testid="term-foto-btn"
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/15 ring-1 ring-white/10 transition-shadow hover:ring-brand/60"
                title="Cambiar foto"
              >
                {termFoto ? (
                  <img
                    src={termFoto}
                    alt="perfil"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = MARCH_LOGO;
                    }}
                    className="h-full w-full object-cover"
                  />
                ) : logo ? (
                  <img
                    src={logo}
                    alt="logo"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = MARCH_LOGO;
                    }}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <Car className="h-4 w-4 text-brand-bright" />
                )}
              </button>
              {fotoInput}
              <div className="hidden sm:block">
                <div className="text-xs font-semibold leading-none text-foreground">{termUser?.nombre || "Operadora"}</div>
                <div className="mt-1">
                  <ConnectionBadge state={connected ? "online" : "reconnecting"} />
                </div>
              </div>
            </div>
            <button data-testid="terminal-logout" onClick={onLogout} title="Salir" aria-label="Salir" className="th-3d flex h-9 w-9 items-center justify-center rounded-xl text-foreground/80 hover:bg-white/[0.08]">
              <LogOut className="th-icon-3d h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contadores compactos (móvil) */}
      <div className="no-scrollbar pointer-events-auto flex items-center gap-2 overflow-x-auto lg:hidden">
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
});

export default OpsTopbar;
