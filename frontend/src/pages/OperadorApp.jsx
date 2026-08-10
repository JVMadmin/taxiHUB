import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, getToken, logoutOperador, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { elapsed } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Car, Power, LogOut, MapPin, Bell, Package, MessageSquare, Send, X, PlayCircle, StopCircle } from "lucide-react";

const LOC_INTERVAL = 9000; // 8-10s

export default function OperadorApp() {
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [coords, setCoords] = useState(null);
  const [servicio, setServicio] = useState(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const fileRef = useRef(null);
  const [inicio, setInicio] = useState(null);
  const [, setSec] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [reportDesc, setReportDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [servicioPropio, setServicioPropio] = useState(null);
  const [iniciarOpen, setIniciarOpen] = useState(false);
  const [iniciarForm, setIniciarForm] = useState({ origen_texto: "", destino_texto: "", costo: "" });

  const enOperacion = op && op.estado !== "fuera_de_servicio";

  // Cronómetro de operación
  useEffect(() => {
    if (!enOperacion) return;
    const t = setInterval(() => setSec((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [enOperacion]);

  // Carga inicial
  useEffect(() => {
    if (!getToken()) { navigate("/login"); return; }
    Promise.all([api.get("/auth/me"), api.get("/rutas")])
      .then(([me, rt]) => {
        setOp(me.data);
        setRutas(rt.data);
        if (me.data.estado !== "fuera_de_servicio") setInicio(Date.now());
      })
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
      } else if (msg.type === "mensaje") {
        setChatMsgs((m) => (m.some((x) => x.id === msg.mensaje.id) ? m : [...m, msg.mensaje]));
        if (msg.mensaje.remitente === "terminal") toast.info("💬 Mensaje de la central");
      }
    };
    return () => ws.close();
  }, [op]);

  const cambiarEstado = async (estado) => {
    await api.patch(`/operadores/${op.id}/estado`, { estado });
    setOp((p) => ({ ...p, estado }));
  };

  const entrar = async () => {
    setInicio(Date.now());
    await cambiarEstado("libre");
    toast.success("Estás en operación");
  };
  const salir = async () => {
    clearInterval(timerRef.current);
    setInicio(null);
    await cambiarEstado("fuera_de_servicio");
    toast("Saliste de operación");
  };

  const seleccionarRuta = async (rutaId) => {
    const val = rutaId === "libre" ? null : rutaId;
    await api.put(`/operadores/${op.id}`, { ruta_asignada: val });
    setOp((p) => ({ ...p, ruta_asignada: val }));
  };

  const logout = () => { logoutOperador(); navigate("/login"); };

  const abrirChat = async () => {
    setChatOpen(true);
    const { data } = await api.get(`/mensajes?operador_id=${op.id}`);
    setChatMsgs(data);
  };
  const enviarChat = async () => {
    if (!chatText.trim()) return;
    const t = chatText; setChatText("");
    await api.post("/mensajes", { operador_id: op.id, remitente: "operador", texto: t });
  };
  const enviarReporte = async () => {
    if (!pendingFile) return;
    const fd = new FormData();
    fd.append("operador_id", op.id);
    if (reportDesc) fd.append("descripcion", reportDesc);
    fd.append("foto", pendingFile);
    setUploading(true);
    try {
      await api.post("/reportes", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Objeto reportado a la central");
      setPendingFile(null); setReportDesc("");
    } catch (_) {
      toast.error("No se pudo enviar el reporte");
    } finally { setUploading(false); }
  };

  const iniciarServicio = async () => {
    if (!iniciarForm.origen_texto.trim() || !iniciarForm.destino_texto.trim()) { toast.error("Origen y destino requeridos"); return; }
    const { data } = await api.post(`/operadores/${op.id}/servicio`, {
      origen_texto: iniciarForm.origen_texto,
      destino_texto: iniciarForm.destino_texto,
      costo: iniciarForm.costo ? Number(iniciarForm.costo) : null,
    });
    setServicioPropio(data);
    setOp((p) => ({ ...p, estado: "ocupado" }));
    setIniciarOpen(false);
    setIniciarForm({ origen_texto: "", destino_texto: "", costo: "" });
    toast.success("Servicio iniciado");
  };
  const terminarServicio = async () => {
    await api.post(`/servicios/${servicioPropio.id}/terminar`);
    setServicioPropio(null);
    setOp((p) => ({ ...p, estado: "libre" }));
    toast.success("Servicio terminado");
  };

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
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
            <Button
              data-testid="logout-btn"
              variant="ghost"
              size="icon"
              onClick={logout}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
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
          {enOperacion && inicio && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-zinc-500">En operación</div>
              <div data-testid="tiempo-operacion" className="font-mono text-lg font-semibold text-emerald-400">{elapsed(inicio)}</div>
            </div>
          )}
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

        {/* Iniciar / Terminar servicio propio */}
        {enOperacion && (
          servicioPropio ? (
            <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4" data-testid="servicio-propio">
              <div className="mb-1 text-sm font-semibold text-emerald-300">Servicio en curso</div>
              <div className="text-sm text-zinc-200">
                <div>{servicioPropio.origen_texto} → {servicioPropio.destino_texto}</div>
                {servicioPropio.costo != null && <div className="text-zinc-400">Costo: ${servicioPropio.costo}</div>}
              </div>
              <Button data-testid="terminar-servicio-btn" onClick={terminarServicio} className="mt-3 h-11 w-full bg-red-500 font-semibold text-white hover:bg-red-600">
                <StopCircle className="mr-2 h-5 w-5" /> Terminar servicio
              </Button>
            </div>
          ) : (
            <Button data-testid="iniciar-servicio-btn" onClick={() => setIniciarOpen(true)} className="mt-6 h-12 w-full bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">
              <PlayCircle className="mr-2 h-5 w-5" /> Iniciar servicio
            </Button>
          )
        )}

        {/* Acciones: reporte y chat */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button
            data-testid="reportar-objeto-btn"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="h-12 border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          >
            <Package className="mr-2 h-4 w-4" /> Reportar objeto
          </Button>
          <Button
            data-testid="abrir-chat-btn"
            variant="outline"
            onClick={abrirChat}
            className="h-12 border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          >
            <MessageSquare className="mr-2 h-4 w-4" /> Chat central
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
        />

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

      {/* Overlay: iniciar servicio */}
      {iniciarOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="iniciar-overlay">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Iniciar servicio</h3>
              <button onClick={() => setIniciarOpen(false)} className="text-zinc-400 hover:text-zinc-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3">
              <Input data-testid="iniciar-origen" value={iniciarForm.origen_texto} onChange={(e) => setIniciarForm((f) => ({ ...f, origen_texto: e.target.value }))} placeholder="Origen (colonia/calle)" className="border-zinc-700 bg-zinc-800 text-zinc-100" />
              <Input data-testid="iniciar-destino" value={iniciarForm.destino_texto} onChange={(e) => setIniciarForm((f) => ({ ...f, destino_texto: e.target.value }))} placeholder="Destino (colonia/calle)" className="border-zinc-700 bg-zinc-800 text-zinc-100" />
              <Input data-testid="iniciar-costo" type="number" value={iniciarForm.costo} onChange={(e) => setIniciarForm((f) => ({ ...f, costo: e.target.value }))} placeholder="Costo (opcional)" className="border-zinc-700 bg-zinc-800 text-zinc-100" />
              <Button data-testid="iniciar-confirmar" onClick={iniciarServicio} className="h-11 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">Iniciar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay: confirmar reporte */}
      {pendingFile && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="reporte-overlay">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Reportar objeto olvidado</h3>
              <button onClick={() => setPendingFile(null)} className="text-zinc-400 hover:text-zinc-100"><X className="h-5 w-5" /></button>
            </div>
            <img src={URL.createObjectURL(pendingFile)} alt="preview" className="mb-3 max-h-56 w-full rounded-lg object-cover" />
            <Input
              data-testid="reporte-descripcion"
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className="mb-3 bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <Button data-testid="reporte-enviar" onClick={enviarReporte} disabled={uploading} className="h-11 w-full bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">
              {uploading ? "Enviando…" : "Enviar reporte"}
            </Button>
          </div>
        </div>
      )}

      {/* Overlay: chat */}
      {chatOpen && (
        <div className="fixed inset-0 z-[900] flex flex-col bg-zinc-950" data-testid="chat-overlay">
          <div className="mx-auto flex h-full w-full max-w-md flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Chat con la central</h3>
              <button data-testid="chat-cerrar" onClick={() => setChatOpen(false)} className="text-zinc-400 hover:text-zinc-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-op-mensajes">
              {chatMsgs.length === 0 && <div className="mt-6 text-center text-xs text-zinc-500">Aún no hay mensajes</div>}
              {chatMsgs.map((m) => (
                <div key={m.id} className={`flex ${m.remitente === "operador" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.remitente === "operador" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-100"}`}>
                    {m.texto}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                data-testid="chat-op-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarChat()}
                placeholder="Escribe un mensaje…"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
              <Button data-testid="chat-op-enviar" onClick={enviarChat} size="icon" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
