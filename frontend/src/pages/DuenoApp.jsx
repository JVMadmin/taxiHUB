import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WS_BASE, getDuenoToken, getDueno, logoutDueno } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ModeToggle } from "@/components/ModeToggle";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { Dashboard } from "@/pages/dueno/Dashboard";
import { Flota } from "@/pages/dueno/Flota";
import { Mapa } from "@/pages/dueno/Mapa";
import { Servicios } from "@/pages/dueno/Servicios";
import { Reportes } from "@/pages/dueno/Reportes";
import { LayoutDashboard, Car, ClipboardList, Map as MapIcon, BarChart3, LogOut } from "lucide-react";

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "flota", label: "Flota", icon: Car },
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
  const wsRef = useRef(null);

  useEffect(() => { if (!getDuenoToken()) navigate("/dueno/login"); }, [navigate]);

  useEffect(() => {
    if (!dueno?.id) return;
    let closed = false;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/dueno/${dueno.id}?token=${encodeURIComponent(getDuenoToken() || "")}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = () => setLiveSignal((n) => n + 1);
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, [dueno?.id]);

  const salir = () => { logoutDueno(); navigate("/dueno/login"); };

  if (!dueno) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <BrandMark size="sm" />
          <BrandWordmark sub="Panel del dueño" />
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
          <ConnectionBadge state={connected ? "online" : "reconnecting"} />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-foreground">{dueno.nombre}</span>
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
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span className="font-bold text-foreground">{dueno.nombre}</span>
          </div>
          <div className="flex items-center gap-1">
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
        <header className="hidden items-center justify-end gap-2 border-b border-border bg-card/40 px-6 py-3 lg:flex">
          <ModeToggle />
          <ThemeSwitcher />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">
          {active === "dashboard" && <Dashboard liveSignal={liveSignal} />}
          {active === "flota" && <Flota liveSignal={liveSignal} />}
          {active === "servicios" && <Servicios />}
          {active === "mapa" && <Mapa liveSignal={liveSignal} />}
          {active === "reportes" && <Reportes />}
        </main>

        {/* Navegación inferior (móvil) */}
        <nav className="fixed inset-x-0 bottom-0 z-[500] flex border-t border-border bg-card/95 backdrop-blur lg:hidden" data-testid="dueno-nav-mobile">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              data-testid={`dueno-navmobile-${s.id}`}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold",
                active === s.id ? "text-brand-bright" : "text-muted-foreground"
              )}
            >
              <s.icon className="h-5 w-5" /> {s.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
