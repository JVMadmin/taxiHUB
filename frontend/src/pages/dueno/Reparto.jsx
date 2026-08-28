import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Handshake, Plus, X } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

export function Reparto({ liveSignal }) {
  const [rows, setRows] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: "", porcentaje: "", vehiculo_ids: [] });

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/reparto/calculo"),
      duenoApi.get("/dueno/flota"),
    ])
      .then(([r1, r2]) => { setRows(r1.data); setVehiculos(r2.data); })
      .catch(() => setError("No se pudo calcular el reparto"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const toggleVehiculo = (id) => {
    setForm((f) => ({
      ...f,
      vehiculo_ids: f.vehiculo_ids.includes(id)
        ? f.vehiculo_ids.filter((x) => x !== id)
        : [...f.vehiculo_ids, id],
    }));
  };

  const altaSocio = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await duenoApi.post("/dueno/reparto/socios", {
        nombre: form.nombre.trim(),
        porcentaje: Number(form.porcentaje),
        vehiculo_ids: form.vehiculo_ids,
      });
      setAbierto(false);
      setForm({ nombre: "", porcentaje: "", vehiculo_ids: [] });
      load();
    } catch {
      setError("No se pudo dar de alta al socio");
    } finally {
      setGuardando(false);
    }
  };

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-reparto-error" />;
  if (!rows) return <LoadingState rows={3} testId="dueno-reparto-loading" />;

  return (
    <div className="space-y-6" data-testid="dueno-reparto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Reparto de ganancias</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Cálculo del mes actual por socio, según su % de participación.</p>
        </div>
        <Button data-testid="dueno-reparto-nuevo" onClick={() => setAbierto((a) => !a)} size="sm">
          <Plus className="h-3.5 w-3.5" /> {abierto ? "Cerrar" : "Alta de socio"}
        </Button>
      </div>

      {abierto && (
        <form onSubmit={altaSocio} className="rounded-2xl border border-border bg-card p-4" data-testid="dueno-reparto-form">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Dar de alta un socio</h3>
            <button type="button" onClick={() => setAbierto(false)} className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="reparto-nombre">Nombre del socio</Label>
              <Input id="reparto-nombre" required placeholder="Ej. Juan Pérez"
                value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="reparto-porcentaje">Porcentaje (%)</Label>
              <Input id="reparto-porcentaje" type="number" inputMode="decimal" min="0" max="100" required placeholder="Ej. 50"
                value={form.porcentaje} onChange={(e) => setForm((f) => ({ ...f, porcentaje: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label>Unidades incluidas</Label>
              {vehiculos.length === 0 ? (
                <div className="mt-1.5 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No tienes vehículos registrados todavía.
                </div>
              ) : (
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vehiculos.map((v) => {
                    const checked = form.vehiculo_ids.includes(v.id);
                    return (
                      <label key={v.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs font-semibold hover:border-brand/50">
                        <Checkbox checked={checked} onCheckedChange={() => toggleVehiculo(v.id)} data-testid={`reparto-vehiculo-${v.numero_economico}`} />
                        {v.numero_economico}{v.marca ? ` · ${v.marca}` : ""}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={guardando} data-testid="dueno-reparto-guardar">
              {guardando ? "Guardando…" : "Guardar socio"}
            </Button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Sin socios configurados"
          description="Agrega a tus socios y qué unidades les corresponden para ver el reparto calculado."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left">Socio</th>
                <th className="p-2.5 text-left">%</th>
                <th className="p-2.5 text-left">Ingresos atribuidos</th>
                <th className="p-2.5 text-right">A recibir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.socio} className="border-b border-border/60 last:border-0">
                  <td className="p-2.5 font-bold">{r.socio}</td>
                  <td className="mono-num p-2.5">{r.porcentaje}%</td>
                  <td className="mono-num p-2.5">{fmtMXN(r.ingresos_atribuidos)}</td>
                  <td className="mono-num p-2.5 text-right font-extrabold text-brand-bright">{fmtMXN(r.a_recibir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Reparto;