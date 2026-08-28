import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Repeat, Plus, X, Check } from "@/design/icons";

/**
 * Asignaciones (F9 premium §21): SOCIO → UNIDAD → CONDUCTOR con historial.
 * Crear cierra la asignación activa previa de la unidad. Finalizar conserva
 * el historial. Solo el socio dueño opera aquí (permisos en backend).
 */
export function Asignaciones({ liveSignal }) {
  const [items, setItems] = useState(null);
  const [flota, setFlota] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ vehiculo_id: "", operador_id: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/asignaciones"),
      duenoApi.get("/dueno/flota"),
      duenoApi.get("/dueno/conductores"),
    ])
      .then(([a, f, c]) => { setItems(a.data); setFlota(f.data); setConductores(c.data); })
      .catch(() => setError("No se pudieron cargar las asignaciones"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const crear = async (e) => {
    e.preventDefault();
    if (!form.vehiculo_id || !form.operador_id) { toast.error("Elige unidad y conductor"); return; }
    setSaving(true);
    try {
      await duenoApi.post("/dueno/asignaciones", form);
      toast.success("Asignación creada");
      setForm({ vehiculo_id: "", operador_id: "" });
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo crear la asignación");
    } finally {
      setSaving(false);
    }
  };

  const finalizar = async (id) => {
    try {
      await duenoApi.post(`/dueno/asignaciones/${id}/finalizar`);
      toast.success("Asignación finalizada");
      load();
    } catch {
      toast.error("No se pudo finalizar");
    }
  };

  const inputCls = "input-inset border-border text-foreground";

  return (
    <div className="space-y-6" data-testid="dueno-asignaciones">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Asignaciones</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">SOCIO → UNIDAD → CONDUCTOR, con historial completo.</p>
        </div>
        <Button data-testid="asignaciones-nueva" size="sm" onClick={() => setFormOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Nueva asignación
        </Button>
      </div>

      {formOpen && (
        <form onSubmit={crear} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]" data-testid="asignaciones-form">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Unidad</label>
            <Select value={form.vehiculo_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, vehiculo_id: v }))}>
              <SelectTrigger data-testid="asignaciones-vehiculo" className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Elige…</SelectItem>
                {flota.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.numero_economico} — {v.conductor?.nombre || "sin conductor"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Conductor</label>
            <Select value={form.operador_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, operador_id: v }))}>
              <SelectTrigger data-testid="asignaciones-conductor" className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Elige…</SelectItem>
                {conductores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" data-testid="asignaciones-guardar" disabled={saving} className="w-full">
              {saving ? "…" : <><Check className="h-4 w-4" /> Asignar</>}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
          </div>
        </form>
      )}

      {error && <ErrorState description={error} onRetry={load} />}
      {!error && items === null && <LoadingState rows={3} />}
      {!error && items !== null && items.length === 0 && (
        <EmptyState icon={Repeat} title="Sin asignaciones" description="Crea la primera asignación unidad ↔ conductor." />
      )}
      {!error && items !== null && items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="th-table" data-testid="asignaciones-table">
            <thead>
              <tr><th>Unidad</th><th>Conductor</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono font-bold text-foreground">{a.vehiculo}</td>
                  <td className="text-foreground/90">{a.conductor}</td>
                  <td className="text-xs text-muted-foreground">{a.inicio?.slice(0, 16).replace("T", " ")}</td>
                  <td className="text-xs text-muted-foreground">{a.fin ? a.fin.slice(0, 16).replace("T", " ") : "—"}</td>
                  <td>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      a.activo ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground")}>
                      {a.activo ? "Activa" : "Finalizada"}
                    </span>
                  </td>
                  <td className="text-right">
                    {a.activo && (
                      <Button data-testid={`asignaciones-finalizar-${a.id}`} size="sm" variant="secondary" onClick={() => finalizar(a.id)}>
                        Finalizar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Asignaciones;
