import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, getToken, logoutOperador, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Car, Power, LogOut, MapPin, Bell } from "lucide-react";

const LOC_INTERVAL = 9000; // 8-10s

export default function OperadorApp() {
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [coords, setCoords] = useState(null);
  const [servicio, setServicio] = useState(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  const enOperacion = op && op.estado !== "fuera_de_servicio";

  // Carga inicial
  useEffect(() => {
    if (!getToken()) { navigate("/login"); return; }
    Promise.all([api.get("/auth/me"), api.get("/rutas")])
      .then(([me, rt]) => { setOp(me.data); setRutas(rt.data); })
      .catch(() => { logoutOperador(); navigate("/login"); });
  }, [navigate]);

  const sendLocation = useCallback((id) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setCoords({ lat, lng });
        try { await api.post(`/operadores/${id}/ubicacion`, { lat, lng }); } catch (_) {}
      },
      (err) => toast.error("No se pudo obtener tu ubicación: " + err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );
  }, []);

  // Envío automático de ubicación mientras está en operación
  useEffect(() => {
    if (enOperacion && op) {
      sendLocation(op.id);
      timerRef.current = setInterval(() => sendLocation(op.id), LOC_INTERVAL);
    }
    return () => clearInterval(timerRef.current);
  }, [enOperacion, op, sendLocation]);

  // WebSocket: recibe asignación de servicios
  useEffect(() => {
    if (!op) return;
    const WS_BASE = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + "/api";
    const ws = new WebSocket(`${WS_BASE}/ws/operador/${op.id}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "nuevo_servicio") {
        setServicio(msg.servicio);
        toast.info("🚕 Nuevo servicio asignado");
      }
    };
    return () => ws.close();
  }, [op]);

  const cambiarEstado = async (estado) => {
    await api.patch(`/operadores/${op.id}/estado`, { estado });
    setOp((p) => ({ ...p, estado }));
  };

  const entrar = async () => {
    await cambiarEstado("libre");
    toast.success("Estás en operación");
  };
  const salir = async () => {
    clearInterval(timerRef.current);
    await cambiarEstado("fuera_de_servicio");
    toast("Saliste de operación");
  };

  const seleccionarRuta = async (rutaId) => {
    const val = rutaId === "libre" ? null : rutaId;
    await api.put(`/operadores/${op.id}`, { ruta_asignada: val });
    setOp((p) => ({ ...p, ruta_asignada: val }));
  };

  const logout = () => { logoutOperador(); navigate("/login"); };

  if (!op) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Cargando…</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col p-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15">
              <Car className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <div className="text-base font-bold leading-tight">{op.nombre}</div>
              <div className="text-xs text-zinc-400">Unidad {op.placa}</div>
            </div>
          </div>
          <Button
            data-testid="logout-btn"
            variant="ghost"
            size="icon"
            onClick={logout}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </header>

        {/* Estado actual */}
        <div
          data-testid="estado-actual"
          className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
        >
          <span className="h-3 w-3 rounded-full" style={{ background: ESTADO_COLORS[op.estado] }} />
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Estado</div>
            <div className="text-lg font-semibold">{ESTADO_LABEL[op.estado]}</div>
          </div>
        </div>

        {/* Selector de ruta */}
        <div className="mt-4">
          <div className="mb-1.5 text-xs uppercase tracking-wide text-zinc-500">Ruta (colectivo)</div>
          <Select value={op.ruta_asignada || "libre"} onValueChange={seleccionarRuta}>
            <SelectTrigger
              data-testid="ruta-select"
              className="bg-zinc-900 border-zinc-800 text-zinc-100"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <SelectItem value="libre" className="focus:bg-zinc-800">Taxi libre (sin ruta)</SelectItem>
              {rutas.map((r) => (
                <SelectItem key={r.id} value={r.id} className="focus:bg-zinc-800">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                    {r.nombre}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Botones de estado (en operación) */}
        {enOperacion && (
          <div className="mt-6" data-testid="estado-buttons">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Cambiar disponibilidad</div>
            <div className="grid grid-cols-3 gap-2">
              {["libre", "ocupado", "no_disponible"].map((e) => {
                const active = op.estado === e;
                return (
                  <button
                    key={e}
                    data-testid={`estado-${e}`}
                    onClick={() => cambiarEstado(e)}
                    className="rounded-xl border px-2 py-4 text-sm font-semibold transition-all"
                    style={{
                      borderColor: active ? ESTADO_COLORS[e] : "#27272a",
                      background: active ? ESTADO_COLORS[e] + "22" : "transparent",
                      color: active ? ESTADO_COLORS[e] : "#a1a1aa",
                    }}
                  >
                    <span
                      className="mx-auto mb-1.5 block h-2.5 w-2.5 rounded-full"
                      style={{ background: ESTADO_COLORS[e] }}
                    />
                    {ESTADO_LABEL[e]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Servicio asignado */}
        {servicio && (
          <div
            data-testid="servicio-asignado"
            className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <Bell className="h-4 w-4" /> Servicio asignado
            </div>
            <div className="text-sm text-zinc-200">
              <div><span className="text-zinc-400">Origen:</span> {servicio.origen?.texto}</div>
              <div><span className="text-zinc-400">Destino:</span> {servicio.destino?.texto}</div>
              {servicio.cliente_nombre && (
                <div><span className="text-zinc-400">Cliente:</span> {servicio.cliente_nombre} {servicio.cliente_telefono}</div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Estado de ubicación */}
        <div className="mb-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <MapPin className={`h-3.5 w-3.5 ${enOperacion && coords ? "text-emerald-400" : ""}`} />
          {enOperacion
            ? coords
              ? `Enviando ubicación · ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
              : "Obteniendo ubicación…"
            : "Ubicación en pausa"}
        </div>

        {/* Botón grande Entrar / Salir */}
        {enOperacion ? (
          <Button
            data-testid="salir-operacion-btn"
            onClick={salir}
            className="h-16 w-full rounded-2xl bg-red-500 text-lg font-bold text-white hover:bg-red-600"
          >
            <Power className="mr-2 h-6 w-6" /> Salir de operación
          </Button>
        ) : (
          <Button
            data-testid="entrar-operacion-btn"
            onClick={entrar}
            className="h-16 w-full rounded-2xl bg-emerald-500 text-lg font-bold text-zinc-950 hover:bg-emerald-400"
          >
            <Power className="mr-2 h-6 w-6" /> Entrar en operación
          </Button>
        )}
      </div>
    </div>
  );
}
