import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, WS_BASE, ESTADO_COLORS, ESTADO_LABEL } from "@/lib/api";
import { taxiIcon, colorForOperador } from "@/lib/taxiIcon";
import { ServicioModal } from "@/components/ServicioModal";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Radio, PhoneCall, Filter, Car } from "lucide-react";

const CENTER = [17.5099, -91.9847]; // Palenque, Chiapas
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export default function Terminal() {
  const [operadores, setOperadores] = useState({}); // keyed by id
  const [rutas, setRutas] = useState([]);
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const wsRef = useRef(null);

  const upsert = useCallback((op) => {
    setOperadores((prev) => ({ ...prev, [op.id]: { ...prev[op.id], ...op } }));
  }, []);

  const load = useCallback(async () => {
    const [ops, rts] = await Promise.all([api.get("/operadores"), api.get("/rutas")]);
    const map = {};
    ops.data.forEach((o) => { map[o.id] = o; });
    setOperadores(map);
    setRutas(rts.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // WebSocket en vivo
  useEffect(() => {
    let closed = false;
    let timer;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/terminal`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ubicacion") {
          setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], lat: msg.lat, lng: msg.lng, ultima_actualizacion: msg.ts } }
            : prev);
        } else if (msg.type === "estado") {
          setOperadores((prev) => prev[msg.operador_id]
            ? { ...prev, [msg.operador_id]: { ...prev[msg.operador_id], estado: msg.estado } }
            : prev);
        } else if (msg.type === "servicio") {
          toast.info("Servicio actualizado en el sistema");
        }
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, []);

  const lista = useMemo(() => Object.values(operadores), [operadores]);

  const rutaSel = useMemo(
    () => (filtroRuta === "todas" ? null : rutas.find((r) => r.id === filtroRuta)),
    [filtroRuta, rutas]
  );

  const visibles = useMemo(() => {
    return lista.filter((o) => {
      if (o.lat == null || o.lng == null) return false;
      if (o.estado === "fuera_de_servicio") return false;
      if (filtroRuta !== "todas" && o.ruta_asignada !== filtroRuta) return false;
      return true;
    });
  }, [lista, filtroRuta]);

  const operadoresLibres = useMemo(
    () => lista.filter((o) => o.estado === "libre"),
    [lista]
  );

  const nombreRuta = (id) => rutas.find((r) => r.id === id)?.nombre || "Taxi libre";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {/* MAPA (elemento principal, a pantalla completa) */}
      <div className="absolute inset-0 z-0" data-testid="terminal-map">
        <MapContainer center={CENTER} zoom={13} zoomControl={false} className="h-full w-full">
          <TileLayer
            url={DARK_TILES}
            attribution='&copy; OpenStreetMap &copy; CARTO'
            subdomains="abcd"
          />
          {visibles.map((o) => (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              icon={taxiIcon(colorForOperador(o, rutaSel?.color_hex), o.placa)}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{o.nombre}</div>
                  <div>Unidad: {o.placa}</div>
                  <div>Estado: {ESTADO_LABEL[o.estado]}</div>
                  <div>Ruta: {nombreRuta(o.ruta_asignada)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Barra superior flotante */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-center justify-between p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/85 px-4 py-2.5 backdrop-blur-md">
          <Car className="h-5 w-5 text-emerald-400" />
          <div>
            <h1 className="text-sm font-bold leading-none text-zinc-50">Central de Taxis · Terminal</h1>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <Radio className={`h-3 w-3 ${connected ? "text-emerald-400" : "text-zinc-600"}`} />
              {connected ? "En vivo" : "Reconectando..."}
            </div>
          </div>
        </div>
        <Button
          data-testid="nueva-llamada-btn"
          onClick={() => setModalOpen(true)}
          className="pointer-events-auto bg-emerald-500 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
        >
          <PhoneCall className="mr-2 h-4 w-4" /> Nueva llamada
        </Button>
      </header>

      {/* Panel lateral flotante: filtro + lista */}
      <aside
        data-testid="terminal-sidebar"
        className="absolute bottom-4 left-4 top-24 z-[500] flex w-72 flex-col gap-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/85 p-3 backdrop-blur-md"
      >
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <Filter className="h-3.5 w-3.5" /> Filtrar por ruta
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              data-testid="filtro-todas"
              onClick={() => setFiltroRuta("todas")}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filtroRuta === "todas"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              Todas
            </button>
            {rutas.map((r) => (
              <button
                key={r.id}
                data-testid={`filtro-ruta-${r.id}`}
                onClick={() => setFiltroRuta(r.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  filtroRuta === r.id
                    ? "border-zinc-100 bg-zinc-800 text-zinc-50"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color_hex }} />
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-zinc-800" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Taxis activos ({visibles.length})
          </div>
          <div className="space-y-1.5">
            {visibles.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-500">
                No hay taxis en operación
              </div>
            )}
            {visibles.map((o) => (
              <div
                key={o.id}
                data-testid={`operador-item-${o.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-2.5 py-2"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: ESTADO_COLORS[o.estado] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{o.nombre}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {o.placa} · {ESTADO_LABEL[o.estado]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leyenda */}
        <div className="grid grid-cols-2 gap-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
          {Object.entries(ESTADO_LABEL).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_COLORS[k] }} />
              {label}
            </div>
          ))}
        </div>
      </aside>

      <ServicioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        operadoresLibres={operadoresLibres}
        onCreated={() => load()}
      />
    </div>
  );
}
