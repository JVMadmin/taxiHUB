import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sun, Moon, User, Pencil, X } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

/** Editor de turnos por vehículo (F10): modo normal o relevo día/noche. */
function EditorTurnos({ vehiculo, modo, turnos, conductores, onClose, onSaved }) {
  const esTurnos = modo === "turnos";
  const [estado, setEstado] = useState(() => {
    if (!esTurnos) {
      return [{ operador_id: turnos[0]?.operador_id || "" }];
    }
    return ["dia", "noche"].map((tipo) => {
      const t = turnos.find((x) => x.tipo === tipo) || {};
      return { tipo, operador_id: t.operador_id || "", horario_inicio: t.horario_inicio || "", horario_fin: t.horario_fin || "", renta_semanal: t.renta_semanal ?? "" };
    });
  });
  const [saving, setSaving] = useState(false);

  const set = (i, campo, valor) => {
    setEstado((prev) => prev.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = esTurnos
        ? estado.map((t) => ({
            tipo: t.tipo, operador_id: t.operador_id || null,
            horario_inicio: t.horario_inicio || null, horario_fin: t.horario_fin || null,
            renta_semanal: t.renta_semanal === "" ? null : Number(t.renta_semanal),
          }))
        : [{ operador_id: estado[0].operador_id || null }];
      await duenoApi.post("/dueno/turnos/config", {
        vehiculo_id: vehiculo.id, modo, turnos: payload,
      });
      toast.success(esTurnos ? "Turnos guardados" : "Conductor asignado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "input-inset border-border text-foreground";

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4" data-testid="turnos-modal">
      <form onSubmit={enviar} className="w-full max-w-lg animate-scale-in rounded-2xl border border-border bg-card p-4 elev-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">
            {esTurnos ? "Turnos día/noche" : "Conductor único"} — {vehiculo.numero_economico}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        {esTurnos ? (
          <div className="space-y-3">
            {estado.map((t, i) => (
              <div key={t.tipo} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
                  {t.tipo === "dia" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-blue-400" />}
                  {t.tipo === "dia" ? "Turno día" : "Turno noche"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-muted-foreground">Conductor</label>
                    <Select value={t.operador_id || "none"} onValueChange={(v) => set(i, "operador_id", v === "none" ? "" : v)}>
                      <SelectTrigger data-testid={`turnos-cond-${t.tipo}`} className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {conductores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-muted-foreground">Renta semanal ($)</label>
                    <Input data-testid={`turnos-renta-${t.tipo}`} type="number" value={t.renta_semanal}
                           onChange={(e) => set(i, "renta_semanal", e.target.value)}
                           className={`${inputCls} mono-num`} placeholder="Ej. 1500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-muted-foreground">Inicio</label>
                    <Input type="time" value={t.horario_inicio} onChange={(e) => set(i, "horario_inicio", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-muted-foreground">Fin</label>
                    <Input type="time" value={t.horario_fin} onChange={(e) => set(i, "horario_fin", e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Conductor</label>
            <Select value={estado[0].operador_id || "none"} onValueChange={(v) => set(0, "operador_id", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="turnos-cond-normal" className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {conductores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" data-testid="turnos-cancelar" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" data-testid="turnos-guardar" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </div>
  );
}

export function Turnos({ liveSignal }) {
  const [data, setData] = useState(null);
  const [conductores, setConductores] = useState([]);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // {vehiculo, modo, turnos}

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/turnos/resumen"),
      duenoApi.get("/dueno/conductores"),
    ])
      .then(([r1, r2]) => { setData(r1.data); setConductores(r2.data); })
      .catch(() => setError("No se pudo cargar turnos"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-turnos-error" />;
  if (!data) return <LoadingState rows={3} testId="dueno-turnos-loading" />;

  return (
    <div className="space-y-6" data-testid="dueno-turnos">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Turnos y relevos</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Renta cobrada esta semana: <span className="font-bold text-brand-bright">{fmtMXN(data.renta_semana_total)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.vehiculos.map(({ vehiculo, modo, turnos }) => (
          <div key={vehiculo.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-extrabold text-foreground">{vehiculo.numero_economico}</div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                {modo === "normal" ? "Modo normal" : "Turnos día/noche"}
              </span>
            </div>

            {modo === "normal" ? (
              turnos[0]?.operador_id || turnos[0]?.operador_nombre ? (
                <div className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2.5 text-xs">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">
                    {turnos[0].operador_nombre || conductores.find((c) => c.id === turnos[0].operador_id)?.nombre || "Conductor asignado"}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-2.5 text-xs text-muted-foreground">
                  Sin conductor asignado
                </div>
              )
            ) : (
              <div className="space-y-2">
                {["dia", "noche"].map((tipo) => {
                  const t = turnos.find((x) => x.tipo === tipo);
                  const nombre = t?.operador_nombre || conductores.find((c) => c.id === t?.operador_id)?.nombre;
                  return (
                    <div key={tipo} className="flex items-center justify-between rounded-xl bg-secondary/40 p-2.5">
                      <div className="flex items-center gap-2">
                        {tipo === "dia" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-blue-400" />}
                        <div>
                          <div className="text-xs font-bold">{tipo === "dia" ? "Turno día" : "Turno noche"}</div>
                          <div className="text-[10.5px] text-muted-foreground">{nombre || "Sin asignar"}</div>
                        </div>
                      </div>
                      {t?.renta_semanal ? <div className="mono-num text-xs font-extrabold">{fmtMXN(t.renta_semanal)}</div> : null}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Acción de escritura (F10) */}
            <Button
              data-testid={`turnos-editar-${vehiculo.numero_economico}`}
              size="sm" variant="secondary"
              className="mt-3 w-full"
              onClick={() => setEditor({ vehiculo, modo, turnos })}
            >
              <Pencil className="h-3.5 w-3.5" /> Configurar turnos
            </Button>
          </div>
        ))}
      </div>

      {editor && (
        <EditorTurnos
          vehiculo={editor.vehiculo}
          modo={editor.modo}
          turnos={editor.turnos}
          conductores={conductores}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

export default Turnos;
