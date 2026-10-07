import { useCallback, useEffect, useState } from "react";
import { duenoApi, BACKEND_URL } from "@/lib/api";
import { resolveDriverAvatar, resolveVehicleImage } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sun, Moon, User, Pencil, X, Check, Fuel, Gauge, ShieldCheck, Banknote, Camera } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

/** Editor de turnos por vehículo (F10): modo normal o relevo día/noche + cuota diaria. */
function EditorTurnos({ vehiculo, modo, turnos, conductores, onClose, onSaved }) {
  const esTurnos = modo === "turnos";
  const [cuotaDiaria, setCuotaDiaria] = useState(vehiculo.cuota_diaria ?? 350);
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
      if (cuotaDiaria !== "" && Number.isFinite(Number(cuotaDiaria))) {
        await duenoApi.put(`/dueno/vehiculos/${vehiculo.id}/cuota`, {
          cuota_diaria: Number(cuotaDiaria),
        });
      }
      toast.success(esTurnos ? "Turnos y cuota guardados" : "Conductor y cuota guardados");
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

        {/* Cuota diaria del vehículo fijada por el dueño */}
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <Banknote className="h-3.5 w-3.5" /> Cuota diaria por turno ($ MXN)
          </label>
          <Input
            data-testid="turnos-cuota-diaria-input"
            type="number"
            value={cuotaDiaria}
            onChange={(e) => setCuotaDiaria(e.target.value)}
            className={`${inputCls} mono-num font-bold`}
            placeholder="Ej. 350"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Esta cuota se solicitará automáticamente al operador al cerrar o entregar su turno.
          </p>
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
  const [liquidaciones, setLiquidaciones] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [cuotaEdit, setCuotaEdit] = useState({});
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // {vehiculo, modo, turnos}

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/turnos/resumen"),
      duenoApi.get("/dueno/conductores"),
      duenoApi.get("/dueno/turnos/liquidaciones").catch(() => ({ data: { liquidaciones: [], resumen: {} } })),
    ])
      .then(([r1, r2, r3]) => {
        setData(r1.data);
        setConductores(r2.data);
        setLiquidaciones(r3.data);
        const mapCuotas = {};
        (r1.data?.vehiculos || []).forEach(({ vehiculo }) => {
          mapCuotas[vehiculo.id] = vehiculo.cuota_diaria ?? 350;
        });
        setCuotaEdit(mapCuotas);
      })
      .catch(() => setError("No se pudo cargar turnos"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  const guardarCuotaRapida = async (vehiculoId) => {
    const val = Number(cuotaEdit[vehiculoId]);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Monto de cuota inválido");
      return;
    }
    try {
      await duenoApi.put(`/dueno/vehiculos/${vehiculoId}/cuota`, { cuota_diaria: val });
      toast.success(`Cuota diaria actualizada a ${fmtMXN(val)}`);
      load();
    } catch {
      toast.error("No se pudo actualizar la cuota");
    }
  };

  const handleConfirmarLiquidacion = async (turno) => {
    setConfirmandoId(turno.id);
    try {
      await duenoApi.post(`/dueno/turnos/${turno.id}/confirmar-liquidacion`, {
        cuota_confirmada: turno.cuota_entregada ?? turno.cuota_diaria ?? 350,
        unidad_recibida_ok: true,
        observaciones_dueno: "Unidad y efectivo/cuota recibidos de conformidad",
      });
      toast.success(`Liquidación confirmada para unidad ${turno.numero_economico || ""}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo confirmar la liquidación");
    } finally {
      setConfirmandoId(null);
    }
  };

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-turnos-error" />;
  if (!data) return <LoadingState rows={3} testId="dueno-turnos-loading" />;

  const listaLiq = liquidaciones?.liquidaciones || [];
  const resLiq = liquidaciones?.resumen || {};

  return (
    <div className="space-y-6" data-testid="dueno-turnos">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Turnos, cuotas y entrega de unidades</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Renta semanal configurada: <span className="font-bold text-brand-bright">{fmtMXN(data.renta_semana_total)}</span>
            {resLiq.total_recaudado != null && (
              <span className="ml-3">
                · Cuotas liquidadas: <span className="font-bold text-emerald-400">{fmtMXN(resLiq.total_recaudado)}</span>
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tarjetas por vehículo con Cuota Diaria rápida */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.vehiculos.map(({ vehiculo, modo, turnos }) => (
          <div key={vehiculo.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={resolveVehicleImage(vehiculo)}
                    alt={vehiculo.modelo || "Vehículo"}
                    className="h-6 w-10 object-contain drop-shadow-sm"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="font-extrabold text-foreground">{vehiculo.numero_economico}</div>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                  {modo === "normal" ? "Modo normal" : "Turnos día/noche"}
                </span>
              </div>

              {/* Configuración rápida de Cuota Diaria */}
              <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-300 flex items-center gap-1">
                    <Banknote className="h-3.5 w-3.5" /> Cuota por turno ($):
                  </span>
                  <span className="mono-num font-bold text-foreground">
                    Actual: {fmtMXN(vehiculo.cuota_diaria ?? 350)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    data-testid={`cuota-input-${vehiculo.numero_economico}`}
                    type="number"
                    value={cuotaEdit[vehiculo.id] ?? 350}
                    onChange={(e) => setCuotaEdit((prev) => ({ ...prev, [vehiculo.id]: e.target.value }))}
                    className="h-8 input-inset mono-num border-border text-xs font-bold text-foreground"
                  />
                  <Button
                    type="button"
                    size="sm"
                    data-testid={`cuota-guardar-${vehiculo.numero_economico}`}
                    onClick={() => guardarCuotaRapida(vehiculo.id)}
                    className="h-8 shrink-0 !px-2.5 text-xs"
                  >
                    Fijar
                  </Button>
                </div>
              </div>

              {modo === "normal" ? (
                turnos[0]?.operador_id || turnos[0]?.operador_nombre ? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-secondary/40 p-2.5 text-xs">
                    <img
                      src={resolveDriverAvatar(
                        turnos[0]?.foto_url || conductores.find((c) => c.id === turnos[0]?.operador_id)?.foto_url,
                        turnos[0]?.operador_id || turnos[0]?.operador_nombre
                      )}
                      alt="Conductor"
                      className="h-7 w-7 rounded-full object-cover ring-1 ring-border/50 shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = resolveDriverAvatar(null, turnos[0]?.operador_id || turnos[0]?.operador_nombre);
                      }}
                    />
                    <span className="font-semibold text-foreground">
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
                    const cond = conductores.find((c) => c.id === t?.operador_id);
                    const nombre = t?.operador_nombre || cond?.nombre;
                    const foto = t?.foto_url || cond?.foto_url;
                    return (
                      <div key={tipo} className="flex items-center justify-between rounded-xl bg-secondary/40 p-2.5">
                        <div className="flex items-center gap-2.5">
                          {nombre ? (
                            <img
                              src={resolveDriverAvatar(foto, t?.operador_id || nombre)}
                              alt="Conductor"
                              className="h-7 w-7 rounded-full object-cover ring-1 ring-border/50 shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = resolveDriverAvatar(null, t?.operador_id || nombre);
                              }}
                            />
                          ) : (
                            tipo === "dia" ? <Sun className="h-4 w-4 text-amber-400 shrink-0" /> : <Moon className="h-4 w-4 text-blue-400 shrink-0" />
                          )}
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
            </div>

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

      {/* Auditoría de Cierres de Turno, Combustible, Entrega de Unidad y Cuota */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="dueno-liquidaciones-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Recepción de Unidades, Evidencias de Combustible y Liquidación de Cuotas
            </h2>
            <p className="text-xs text-muted-foreground">
              Verifica el kilometraje, nivel de combustible con foto y confirma la entrega física de la unidad y efectivo.
            </p>
          </div>
          {resLiq.pendientes_confirmar > 0 && (
            <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs font-bold text-amber-300">
              {resLiq.pendientes_confirmar} por confirmar ({fmtMXN(resLiq.total_por_confirmar)})
            </span>
          )}
        </div>

        {listaLiq.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Aún no hay turnos registrados para auditar. Cuando los operadores inicien o cierren turno aparecerán aquí.
          </div>
        ) : (
          <div className="space-y-2.5">
            {listaLiq.map((t) => {
              const liquidado = t.estado_liquidacion === "liquidado" || t.confirmado_por_dueno;
              const enCurso = !t.fin;
              return (
                <div
                  key={t.id}
                  data-testid={`liquidacion-row-${t.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <img
                        src={resolveDriverAvatar(t.operador_foto_url, t.operador_id || t.operador_nombre)}
                        alt={t.operador_nombre || "Operador"}
                        className="h-6 w-6 rounded-full object-cover ring-1 ring-border/50 shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = resolveDriverAvatar(null, t.operador_id || t.operador_nombre);
                        }}
                      />
                      <span className="rounded-lg bg-brand/15 px-2 py-0.5 font-mono text-xs font-extrabold text-brand-bright">
                        {t.numero_economico || "Unidad"}
                      </span>
                      <span className="text-sm font-bold text-foreground">{t.operador_nombre || "Operador"}</span>
                      {enCurso ? (
                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                          Turno en curso
                        </span>
                      ) : liquidado ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          ✓ Unidad y cuota confirmadas
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          Pendiente de confirmar recepción
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5 text-brand-bright" />
                        Km: <strong className="mono-num text-foreground">{t.odometro_inicio ?? "—"}</strong>
                        {" → "}
                        <strong className="mono-num text-foreground">{t.odometro_fin ?? "en curso"}</strong>
                        {t.km_recorridos != null && (
                          <span className="text-emerald-400 font-semibold">({t.km_recorridos} km)</span>
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <Fuel className="h-3.5 w-3.5 text-amber-400" />
                        Combustible: <strong className="text-foreground">{t.combustible_inicio || "—"}</strong>
                        {" → "}
                        <strong className="text-foreground">{t.combustible_fin || "—"}</strong>
                      </span>

                      {t.entrega_unidad_confirmada && (
                        <span className="text-emerald-300 font-medium">
                          Entregado a: {t.entrega_a || "Dueño"}
                        </span>
                      )}
                    </div>

                    {/* Links a fotos de evidencia de inicio/fin de turno */}
                    {(t.foto_evidencia_inicio_url || t.foto_evidencia_fin_url || t.notas_entrega) && (
                      <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px]">
                        {t.foto_evidencia_inicio_url && (
                          <a
                            href={`${BACKEND_URL}${t.foto_evidencia_inicio_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-brand-bright underline hover:opacity-80"
                          >
                            <Camera className="h-3 w-3" /> Ver foto recepción
                          </a>
                        )}
                        {t.foto_evidencia_fin_url && (
                          <a
                            href={`${BACKEND_URL}${t.foto_evidencia_fin_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-emerald-400 underline hover:opacity-80"
                          >
                            <Camera className="h-3 w-3" /> Ver foto entrega
                          </a>
                        )}
                        {t.notas_entrega && (
                          <span className="italic text-muted-foreground">“{t.notas_entrega}”</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Monto de cuota y botón de confirmación del dueño */}
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="text-right">
                      <div className="mono-num text-sm font-extrabold text-emerald-400">
                        {fmtMXN(t.cuota_confirmada ?? t.cuota_entregada ?? t.cuota_diaria ?? 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        {t.metodo_pago_cuota || "efectivo"} · meta {fmtMXN(t.cuota_diaria || 350)}
                      </div>
                    </div>

                    {!enCurso && !liquidado && (
                      <Button
                        size="sm"
                        data-testid={`confirmar-liquidacion-${t.id}`}
                        disabled={confirmandoId === t.id}
                        onClick={() => handleConfirmarLiquidacion(t)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {confirmandoId === t.id ? "Confirmando…" : "Confirmar recepción"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
