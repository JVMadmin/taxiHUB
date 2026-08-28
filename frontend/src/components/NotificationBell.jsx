import { useEffect, useRef, useState } from "react";
import { duenoApi } from "@/lib/api";
import { Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationBell({ liveSignal }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], criticas: 0 });
  const ref = useRef(null);

  const load = () => duenoApi.get("/dueno/notificaciones").then((r) => setData(r.data)).catch(() => {});

  useEffect(() => { load(); }, []);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal]);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        data-testid="notification-bell"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {data.criticas > 0 && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-card" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border bg-card p-2 shadow-xl">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notificaciones</div>
          {data.items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Sin alertas activas.</div>
          ) : (
            data.items.map((n, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl p-2 hover:bg-secondary/50">
                <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", n.severidad === "critical" ? "text-red-400" : "text-amber-400")} />
                <div className="text-xs font-semibold text-foreground">{n.mensaje}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
