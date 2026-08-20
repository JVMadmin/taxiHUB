import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { duenoApi, SERVICIO_LABEL } from "@/lib/api";
import { fmtDist, fmtDuration, straightLine } from "@/lib/geo";
import { useMode } from "@/hooks/useMode";
import { DataTable } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { ServicioBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pointIcon } from "@/lib/taxiIcon";
import { ArrowLeft, ClipboardList, User, Car, Wallet, MapPin, Flag } from "lucide-react";

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const ESTADOS = ["pendiente", "ofrecido", "asignado", "en_curso", "completado", "cancelado", "vencido"];

function fila(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function ServiceDetail({ servicioId, onBack }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const mode = useMode();
  const tiles = mode === "claro" ? LIGHT_TILES : DARK_TILES;

  const load = useCallback(() => {
    setError(null);
    duenoApi.get(`/dueno/servicios/${servicioId}`).then((r) => setS(r.data)).catch(() => setError("No se pudo cargar el servicio"));
  }, [servicioId]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!s) return <LoadingState rows={3} />;

  const origen = s.origen?.lat != null ? s.origen : null;
  const destino = s.destino?.lat != null ? s.destino : null;
  const ruta = origen && destino ? straightLine(origen, destino) : null;

  return (
    <div className="space-y-4" data-testid="dueno-servicio-detalle">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a servicios
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono-num font-mono text-sm font-bold text-muted-foreground">#{String(s.id).slice(-6).toUpperCase()}</div>
          <div className="mt-1 text-lg font-extrabold text-foreground">{SERVICIO_LABEL[s.estado] || s.estado}</div>
        </div>
        <ServicioBadge estado={s.estado} />
      </div>

      {ruta && (
        <div className="h-56 overflow-hidden rounded-xl border border-border">
          <MapContainer center={[origen.lat, origen.lng]} zoom={13} className="h-full w-full">
            <TileLayer url={tiles} attribution="&copy; OSM &copy; CARTO" subdomains="abcd" />
            <Polyline positions={ruta} pathOptions={{ color: "#10b981", weight: 4, opacity: 0.85, dashArray: "1 10" }} />
            <Marker position={[origen.lat, origen.lng]} icon={pointIcon("Origen", "#22c55e")} />
            <Marker position={[destino.lat, destino.lng]} icon={pointIcon("Destino", "#ef4444")} />
          </MapContainer>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Información</div>
          <div className="flex items-center gap-2 text-foreground"><User className="h-3.5 w-3.5 text-muted-foreground" /> {s.cliente_nombre || "Sin nombre registrado"}</div>
          {s.operador && (
            <div className="mt-1 flex items-center gap-2 text-foreground"><Car className="h-3.5 w-3.5 text-muted-foreground" /> {s.operador.nombre}{s.vehiculo?.numero_economico ? ` · ${s.vehiculo.numero_economico}` : ""}</div>
          )}
          {s.costo != null && <div className="mt-1 flex items-center gap-2 text-foreground"><Wallet className="h-3.5 w-3.5 text-muted-foreground" /> ${s.costo} ({s.metodo_pago === "card" ? "tarjeta" : "efectivo"})</div>}
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ruta</div>
          <div className="flex items-center gap-2 text-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> <span className="truncate">{s.origen?.texto || s.origen_texto || "—"}</span></div>
          <div className="mt-1 flex items-center gap-2 text-foreground"><Flag className="h-3.5 w-3.5 shrink-0 text-red-400" /> <span className="truncate">{s.destino?.texto || s.destino_texto || "—"}</span></div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cronología</div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div><div className="text-muted-foreground">Solicitud</div><div className="mono-num font-semibold text-foreground">{fila(s.timestamp_creacion)}</div></div>
          <div><div className="text-muted-foreground">Asignación</div><div className="mono-num font-semibold text-foreground">{fila(s.timestamp_asignacion)}</div></div>
          <div><div className="text-muted-foreground">Inicio</div><div className="mono-num font-semibold text-foreground">{fila(s.timestamp_inicio)}</div></div>
          <div><div className="text-muted-foreground">Fin</div><div className="mono-num font-semibold text-foreground">{fila(s.timestamp_fin)}</div></div>
        </div>
      </div>

      {(s.distancia_m != null || s.duracion_s != null) && (
        <div className="grid grid-cols-2 gap-3">
          {s.distancia_m != null && (
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="mono-num text-lg font-bold text-foreground">{fmtDist(s.distancia_m)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Distancia</div>
            </div>
          )}
          {s.duracion_s != null && (
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="mono-num text-lg font-bold text-foreground">{fmtDuration(s.duracion_s)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Duración</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Servicios() {
  const [servicios, setServicios] = useState(null);
  const [error, setError] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [filtros, setFiltros] = useState({ estado: "todos", vehiculo_id: "todos", desde: "", hasta: "" });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => { duenoApi.get("/dueno/flota").then((r) => setVehiculos(r.data)).catch(() => {}); }, []);

  const load = useCallback(() => {
    setError(null);
    setServicios(null);
    const params = {};
    if (filtros.estado !== "todos") params.estado = filtros.estado;
    if (filtros.vehiculo_id !== "todos") params.vehiculo_id = filtros.vehiculo_id;
    if (filtros.desde) params.desde = filtros.desde;
    if (filtros.hasta) params.hasta = filtros.hasta;
    duenoApi.get("/dueno/servicios", { params }).then((r) => setServicios(r.data)).catch(() => setError("No se pudieron cargar los servicios"));
  }, [filtros]);

  useEffect(() => { load(); }, [load]);

  if (selectedId) return <ServiceDetail servicioId={selectedId} onBack={() => setSelectedId(null)} />;

  return (
    <div className="space-y-4" data-testid="dueno-servicios">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Servicios</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Historial de viajes de tu flota.</p>
      </div>

      <FilterBar>
        <Select value={filtros.estado} onValueChange={(v) => setFiltros((f) => ({ ...f, estado: v }))}>
          <SelectTrigger data-testid="dueno-serv-filtro-estado" className="h-9 w-40 border-border text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{SERVICIO_LABEL[e]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtros.vehiculo_id} onValueChange={(v) => setFiltros((f) => ({ ...f, vehiculo_id: v }))}>
          <SelectTrigger data-testid="dueno-serv-filtro-vehiculo" className="h-9 w-44 border-border text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los vehículos</SelectItem>
            {vehiculos.map((v) => <SelectItem key={v.id} value={v.id}>{v.numero_economico}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
          className="input-inset h-9 w-36 border-border text-sm" data-testid="dueno-serv-filtro-desde" />
        <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
          className="input-inset h-9 w-36 border-border text-sm" data-testid="dueno-serv-filtro-hasta" />
      </FilterBar>

      <DataTable
        testId="dueno-servicios-tabla"
        loading={!servicios && !error}
        error={error}
        onRetry={load}
        rows={servicios || []}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyIcon={ClipboardList}
        emptyTitle="Sin servicios en este filtro"
        emptyDescription="Ajusta los filtros o espera a que se registren nuevos viajes."
        columns={[
          { key: "folio", label: "Folio", render: (s) => <span className="mono-num font-mono text-xs">#{String(s.id).slice(-6).toUpperCase()}</span> },
          { key: "fecha", label: "Fecha", render: (s) => <span className="mono-num text-xs">{fila(s.timestamp_creacion)}</span> },
          { key: "cliente_nombre", label: "Pasajero", render: (s) => s.cliente_nombre || "—" },
          { key: "operador_nombre", label: "Conductor" },
          { key: "vehiculo_numero_economico", label: "Vehículo" },
          { key: "origen", label: "Origen", render: (s) => s.origen?.texto || s.origen_texto || "—" },
          { key: "destino", label: "Destino", render: (s) => s.destino?.texto || s.destino_texto || "—" },
          { key: "estado", label: "Estado", render: (s) => <ServicioBadge estado={s.estado} /> },
          { key: "costo", label: "Importe", align: "right", render: (s) => (s.costo != null ? `$${s.costo}` : "—") },
        ]}
      />
    </div>
  );
}

export default Servicios;
