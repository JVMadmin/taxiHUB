import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Fuel, Camera, AlertTriangle, X, Upload } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export function Combustible({ liveSignal }) {
  const [data, setData] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ vehiculo_id: "", fecha: hoy(), litros: "", costo: "", odometro_km: "" });
  const [evidencia, setEvidencia] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/combustible/historial"),
      duenoApi.get("/dueno/flota"),
    ])
      .then(([r1, r2]) => { setData(r1.data); setVehiculos(r2.data); })
      .catch(() => setError("No se pudo cargar el historial de combustible"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const registrar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      let evidencia_url = null;
      if (evidencia) {
        // Mismo mecanismo que las fotos de perfil/vehículo: sube el archivo y
        // usa la URL /api/files/... que regresa, en vez de inventar otro.
        const fd = new FormData();
        fd.append("foto", evidencia);
        const up = await duenoApi.post("/dueno/evidencia", fd, { headers: { "Content-Type": "multipart/form-data" } });
        evidencia_url = up.data.evidencia_url;
      }
      await duenoApi.post("/dueno/combustible/carga", {
        vehiculo_id: form.vehiculo_id,
        fecha: form.fecha,
        litros: Number(form.litros),
        costo: Number(form.costo),
        odometro_km: Number(form.odometro_km),
        evidencia_url,
      });
      setAbierto(false);
      setForm({ vehiculo_id: "", fecha: hoy(), litros: "", costo: "", odometro_km: "" });
      setEvidencia(null);
      load();
    } catch {
      setError("No se pudo registrar la carga");
    } finally {
      setGuardando(false);
    }
  };

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-combustible-error" />;
  if (!data) return <LoadingState rows={4} testId="dueno-combustible-loading" />;

  return (
    <div className="space-y-6" data-testid="dueno-combustible">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Combustible</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Control de carga, rendimiento y evidencia por unidad.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Gasto del mes</div>
          <div className="mono-num mt-1 text-xl font-extrabold">{fmtMXN(data.gasto_mes)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Rendimiento promedio</div>
          <div className="mono-num mt-1 text-xl font-extrabold text-brand-bright">
            {data.rendimiento_promedio ? `${data.rendimiento_promedio} km/L` : "—"}
          </div>
        </div>
        <Button
          data-testid="dueno-combustible-registrar"
          onClick={() => setAbierto((a) => !a)}
          className="h-auto min-h-[88px] flex-col justify-center gap-1 rounded-2xl border border-dashed border-brand/40 bg-brand/5 text-brand-bright"
        >
          <Fuel className="h-4 w-4" />
          <span className="text-xs">{abierto ? "Cerrar" : "Registrar carga"}</span>
        </Button>
      </div>

      {abierto && (
        <form onSubmit={registrar} className="rounded-2xl border border-border bg-card p-4" data-testid="dueno-combustible-form">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Registrar carga de combustible</h3>
            <button type="button" onClick={() => setAbierto(false)} className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="combustible-vehiculo">Vehículo</Label>
              <Select value={form.vehiculo_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, vehiculo_id: v }))}>
                <SelectTrigger id="combustible-vehiculo" className="mt-1.5" data-testid="dueno-combustible-vehiculo">
                  <SelectValue placeholder="Selecciona una unidad" />
                </SelectTrigger>
                <SelectContent>
                  {vehiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.numero_economico}{v.marca ? ` · ${v.marca}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="combustible-fecha">Fecha</Label>
              <Input id="combustible-fecha" type="date" required value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="combustible-litros">Litros</Label>
              <Input id="combustible-litros" type="number" inputMode="decimal" step="0.01" min="0" required placeholder="0.0"
                value={form.litros} onChange={(e) => setForm((f) => ({ ...f, litros: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="combustible-costo">Costo ($)</Label>
              <Input id="combustible-costo" type="number" inputMode="decimal" step="0.01" min="0" required placeholder="0.00"
                value={form.costo} onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="combustible-odometro">Odómetro (km)</Label>
              <Input id="combustible-odometro" type="number" inputMode="decimal" min="0" required placeholder="0"
                value={form.odometro_km} onChange={(e) => setForm((f) => ({ ...f, odometro_km: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label>Evidencia (foto del ticket)</Label>
              <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-xs text-muted-foreground hover:border-brand/50"
                data-testid="dueno-combustible-evidencia">
                <span className="flex items-center gap-2">
                  {evidencia ? <Camera className="h-4 w-4 text-emerald-400" /> : <Upload className="h-4 w-4" />}
                  {evidencia ? evidencia.name : "Toca para subir la foto del ticket"}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setEvidencia(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={guardando} data-testid="dueno-combustible-guardar">
              {guardando ? "Guardando…" : "Guardar carga"}
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="p-2.5 text-left">Fecha</th>
              <th className="p-2.5 text-left">Litros</th>
              <th className="p-2.5 text-left">Costo</th>
              <th className="p-2.5 text-left">Km</th>
              <th className="p-2.5 text-left">Rendimiento</th>
              <th className="p-2.5 text-left">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {data.cargas.map((c) => (
              <tr key={c.id || c._id} className="border-b border-border/60 last:border-0">
                <td className="mono-num p-2.5">{c.fecha}</td>
                <td className="mono-num p-2.5">{c.litros} L</td>
                <td className="mono-num p-2.5">{fmtMXN(c.costo)}</td>
                <td className="mono-num p-2.5">{Number(c.odometro_km || 0).toLocaleString("es-MX")}</td>
                <td className="mono-num p-2.5">{c.rendimiento_km_l ? `${c.rendimiento_km_l} km/L` : "—"}</td>
                <td className="p-2.5">
                  {c.evidencia_url ? (
                    <a href={c.evidencia_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400" data-testid={`evidencia-${c.id}`}>
                      <Camera className="h-3 w-3" /> ticket
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="h-3 w-3" /> sin evidencia</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Combustible;