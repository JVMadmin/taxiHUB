import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WS_BASE, getDuenoToken, getDueno, logoutDueno, fetchSitioConfig, duenoApi } from "@/lib/api";
import { cn, resolveDriverAvatar } from "@/lib/utils";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { DeviceModeToggle } from "@/components/DeviceModeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { Dashboard } from "@/pages/dueno/Dashboard";
import { Ejecutivo } from "@/pages/dueno/Ejecutivo";
import { Socios } from "@/pages/dueno/Socios";
import { Asignaciones } from "@/pages/dueno/Asignaciones";
import { Flota } from "@/pages/dueno/Flota";
import { Mantenimiento } from "@/pages/dueno/Mantenimiento";
import { Conductores } from "@/pages/dueno/Conductores";
import { Turnos } from "@/pages/dueno/Turnos";
import { Combustible } from "@/pages/dueno/Combustible";
import { Reparto } from "@/pages/dueno/Reparto";
import { Mapa } from "@/pages/dueno/Mapa";
import { Servicios } from "@/pages/dueno/Servicios";
import { Reportes } from "@/pages/dueno/Reportes";
import { LayoutDashboard, Car, ClipboardList, Map as MapIcon, BarChart3, LogOut, Wrench, Clock, Fuel as FuelIcon, Handshake, Users2, Repeat, CalendarClock, Megaphone } from "lucide-react";

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ejecutivo", label: "Ejecutivo", icon: BarChart3 },
  { id: "socios", label: "Socios", icon: Handshake },
  { id: "flota", label: "Flota", icon: Car },
  { id: "asignaciones", label: "Asignaciones", icon: Repeat },
  { id: "mantenimiento", label: "Mantenimiento", icon: Wrench },
  { id: "conductores", label: "Conductores", icon: Users2 },
  { id: "turnos", label: "Turnos", icon: Clock },
  { id: "combustible", label: "Combustible", icon: FuelIcon },
  { id: "servicios", label: "Servicios", icon: ClipboardList },
  { id: "mapa", label: "Mapa", icon: MapIcon },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
];

export default function DuenoApp() {
  const navigate = useNavigate();
  const [dueno] = useState(() => getDueno());
  const [active, setActive] = useState("dashboard");
  const [connected, setConnected] = useState(false);
  const [liveSignal, setLiveSignal] = useState(0);
  const [sitioConfig, setSitioConfig] = useState(null);
  const [avisosActivos, setAvisosActivos] = useState([]);
  const wsRef = useRef(null);

  const embedded = new URLSearchParams(window.location.search).get("embed") === "1";
  const [deviceMode, setDeviceMode] = useState(() => (embedded ? "app" : "escritorio"));

  useEffect(() => { if (!getDuenoToken()) navigate("/dueno/login"); }, [navigate]);

  useEffect(() => {
    fetchSitioConfig(dueno?.sitio_id).then((cfg) => {
      if (cfg) setSitioConfig(cfg);
    }).catch(() => {});
    duenoApi.get("/avisos/activos").then((r) => setAvisosActivos(r.data || [])).catch(() => {});
  }, [dueno?.sitio_id]);

  useEffect(() => {
    if (!dueno?.id) return;
    let closed = false;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/dueno/${dueno.id}?token=${encodeURIComponent(getDuenoToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = (ev) => {
        setConnected(false);
        // Token inválido: reintentar es inútil — forzar re-login.
        if (ev.code === 1008) { logoutDueno(); navigate("/dueno/login"); return; }
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = () => setLiveSignal((n) => n + 1);
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, [dueno?.id, navigate]);

  const salir = () => { logoutDueno(); navigate("/dueno/login"); };

  if (!dueno) return null;

  const subRestante = sitioConfig?.suscripcion?.etiqueta_restante || `${sitioConfig?.suscripcion?.dias_restantes ?? 28}d restantes`;
  const subUrgente = (sitioConfig?.suscripcion?.dias_restantes ?? 28) <= 5;

  const renderApp = (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <BrandMark size="sm" />
          <BrandWordmark sub="Panel del Socio" />
        </div>
        <nav className="flex flex-1 flex-col gap-1" data-testid="dueno-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              data-testid={`dueno-nav-${s.id}`}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active === s.id ? "bg-brand/15 text-brand-bright" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2.5 border-t border-border pt-3">
          <div
            data-testid="dueno-subscription-badge"
            className={cn(
              "flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold",
              subUrgente
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            )}
            title={`Vencimiento: ${sitioConfig?.suscripcion?.fecha_vencimiento ? new Date(sitioConfig.suscripcion.fecha_vencimiento).toLocaleDateString("es-MX") : "Activo"}`}
          >
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>Licencia:</span>
            </span>
            <span className="mono-num font-bold">{subRestante}</span>
          </div>
          <ConnectionBadge state={connected ? "online" : "reconnecting"} />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={resolveDriverAvatar(dueno?.foto_url, dueno?.id || dueno?.nombre)}
                alt={dueno?.nombre || "Socio"}
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-brand/40"
                onError={(e) => {
                  e.currentTarget.src = resolveDriverAvatar(null, dueno?.id || dueno?.nombre);
                }}
              />
              <span className="truncate text-sm font-bold text-foreground">{dueno.nombre}</span>
            </div>
            <button data-testid="dueno-logout" onClick={salir} title="Salir"
              className="th-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60"
              aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header móvil */}
        <header className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <BrandMark size="sm" />
            <img
              src={resolveDriverAvatar(dueno?.foto_url, dueno?.id || dueno?.nombre)}
              alt={dueno?.nombre || "Socio"}
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-brand/40"
              onError={(e) => {
                e.currentTarget.src = resolveDriverAvatar(null, dueno?.id || dueno?.nombre);
              }}
            />
            <div>
              <div className="font-bold text-foreground leading-tight">{dueno.nombre}</div>
              <div className="mono-num text-[10px] font-semibold text-emerald-400">⏳ {subRestante}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!embedded && <DeviceModeToggle mode={deviceMode} onChange={setDeviceMode} />}
            <NotificationBell liveSignal={liveSignal} />
            <ModeToggle />
            <ThemeSwitcher />
            <button data-testid="dueno-logout-mobile" onClick={salir} title="Salir"
              className="th-3d flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground"
              aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        {/* Header desktop */}
        <header className="hidden items-center justify-between gap-3 border-b border-border bg-card/40 px-6 py-3 lg:flex">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                subUrgente
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Tiempo restante de uso: {subRestante}</span>
            </span>
            {avisosActivos.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200">
                <Megaphone className="h-3.5 w-3.5 text-indigo-300" />
                <span>{avisosActivos[0].titulo}: {avisosActivos[0].mensaje}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!embedded && <DeviceModeToggle mode={deviceMode} onChange={setDeviceMode} />}
            <NotificationBell liveSignal={liveSignal} />
            <ModeToggle />
            <ThemeSwitcher />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">
          {active === "dashboard" && <Dashboard liveSignal={liveSignal} />}
          {active === "ejecutivo" && <Ejecutivo liveSignal={liveSignal} />}
          {active === "socios" && <Socios liveSignal={liveSignal} />}
          {active === "asignaciones" && <Asignaciones liveSignal={liveSignal} />}
          {active === "flota" && <Flota liveSignal={liveSignal} />}
          {active === "mantenimiento" && <Mantenimiento liveSignal={liveSignal} />}
          {active === "conductores" && <Conductores liveSignal={liveSignal} />}
          {active === "turnos" && <Turnos liveSignal={liveSignal} />}
          {active === "combustible" && <Combustible liveSignal={liveSignal} />}
          {active === "reparto" && <Reparto liveSignal={liveSignal} />}
          {active === "servicios" && <Servicios />}
          {active === "mapa" && <Mapa liveSignal={liveSignal} />}
          {active === "reportes" && <Reportes />}
        </main>

        {/* Navegación inferior (móvil): iconos con scroll horizontal —
            12 secciones no caben como texto en 390px (hallazgo F13). */}
        <nav className="fixed inset-x-0 bottom-0 z-[500] flex overflow-x-auto border-t border-border bg-card/95 backdrop-blur lg:hidden" data-testid="dueno-nav-mobile">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              data-testid={`dueno-navmobile-${s.id}`}
              onClick={() => setActive(s.id)}
              title={s.label}
              aria-label={s.label}
              className={cn(
                "flex min-w-[3.25rem] flex-1 flex-col items-center gap-0.5 px-1 py-2.5 text-[9px] font-semibold",
                active === s.id ? "text-brand-bright" : "text-muted-foreground"
              )}
            >
              <s.icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate text-center">{s.label.slice(0, 8)}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );

  if (deviceMode === "app" && !embedded) {
    const src = `${window.location.pathname}${window.location.search ? window.location.search + "&" : "?"}embed=1`;
    return (
      <div className="flex min-h-screen items-start justify-center gap-4 bg-background p-4">
        <div className="w-full max-w-md">
          <iframe
            title="Vista app del panel del dueño"
            src={src}
            className="h-[calc(100vh-2rem)] w-full rounded-2xl border border-border bg-background shadow-2xl"
            data-testid="dueno-app-iframe"
          />
        </div>
      </div>
    );
  }

  return renderApp;
}