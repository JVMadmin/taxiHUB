import { useCallback, useEffect, useState } from "react";
import { duenoApi } from "@/lib/api";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Wrench, AlertTriangle, Gauge as GaugeIcon, Plus, X } from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

const ESTADO_LABEL = { aldia: "Al día", proximo: "Próximo", urgente: "Urgente" };
const ESTADO_TONE = {
  aldia: "text-emerald-400 bg-emerald-500/15",
  proximo: "text-amber-400 bg-amber-500/15",
  urgente: "text-red-400 bg-red-500/15",
};

const TIPOS_REGISTRO = [
  { v: "aceite", l: "Aceite" }, { v: "llantas", l: "Llantas" },
  { v: "frenos", l: "Frenos" }, { v: "verificacion", l: "Verificación" },
  { v: "otro", l: "Otro" },
];
const TIPOS_DOC = [
  { v: "tarjeta_circulacion", l: "Tarjeta de circulación" },
  { v: "seguro", l: "Seguro" }, { v: "verificacion", l: "Verificación" },
];
const CATEGORIAS_GASTO = [
  { v: "gasolina", l: "Gasolina" }, { v: "refacciones", l: "Refacciones" },
  { v: "multas", l: "Multas" }, { v: "mantenimiento", l: "Mantenimiento" },
  { v: "otro", l: "Otro" },
];

function Gauge({ pct, size = 56 }) {
  const color = pct >= 80 ? "#34d399" : pct >= 40 ? "#f5a524" : "#ef4444";
  const inner = Math.round(size * 0.76);
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${color} 0 ${pct}%, var(--border) 0)` }}
    >
      <div
        className="mono-num flex items-center justify-center rounded-full bg-card text-xs font-extrabold text-foreground"
        style={{ width: inner, height: inner }}
      >
        {Math.round(pct)}%
      </div>
    </div>
  );
}

/** Modal de escritura: registro de servicio, documento o gasto (F9). */
function AccionMantenimiento({ vehiculo, modo, onClose, onSaved }) {
  const [form, setForm] = useState(
    modo === "registro"
      ? { tipo: "aceite", realizado_en: new Date().toISOString().slice(0, 10), odometro_km: "", proximo_km: "", costo: "", notas: "" }
      : modo === "documento"
        ? { tipo: "tarjeta_circulacion", vence_en: "" }
        : { categoria: "refacciones", monto: "", fecha: new Date().toISOString().slice(0, 10), notas: "" }
  );
  const [saving, setSaving] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modo === "registro") {
        await duenoApi.post("/dueno/mantenimiento/registro", {
          vehiculo_id: vehiculo.id, tipo: form.tipo, realizado_en: form.realizado_en,
          odometro_km: form.odometro_km === "" ? null : Number(form.odometro_km),
          proximo_km: form.proximo_km === "" ? null : Number(form.proximo_km),
          costo: Number(form.costo || 0), notas: form.notas || null,
        });
        toast.success("Mantenimiento registrado");
      } else if (modo === "documento") {
        await duenoApi.post("/dueno/mantenimiento/documento", {
          vehiculo_id: vehiculo.id, tipo: form.tipo, vence_en: form.vence_en,
        });
        toast.success("Documento guardado");
      } else {
        await duenoApi.post("/dueno/mantenimiento/gasto", {
          vehiculo_id: vehiculo.id, categoria: form.categoria,
          monto: Number(form.monto), fecha: form.fecha, notas: form.notas || null,
        });
        toast.success("Gasto registrado");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const titulo = { registro: "Registrar servicio", documento: "Actualizar documento", gasto: "Registrar gasto" }[modo];
  const inputCls = "input-inset border-border text-foreground";

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4" data-testid={`mant-modal-${modo}`}>
      <form onSubmit={enviar} className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-4 elev-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Wrench className="h-4 w-4 text-brand-bright" /> {titulo} — {vehiculo.numero_economico}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        {modo === "registro" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Tipo</label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger data-testid="mant-reg-tipo" className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_REGISTRO.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Fecha</label>
                <Input data-testid="mant-reg-fecha" type="date" required value={form.realizado_en} onChange={(e) => setForm((f) => ({ ...f, realizado_en: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Odómetro (km)</label>
                <Input data-testid="mant-reg-odometro" type="number" value={form.odometro_km} onChange={(e) => setForm((f) => ({ ...f, odometro_km: e.target.value }))} className={`${inputCls} mono-num`} placeholder="Ej. 84500" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Próximo (km)</label>
                <Input data-testid="mant-reg-proximo" type="number" value={form.proximo_km} onChange={(e) => setForm((f) => ({ ...f, proximo_km: e.target.value }))} className={`${inputCls} mono-num`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Costo ($)</label>
                <Input data-testid="mant-reg-costo" type="number" value={form.costo} onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))} className={`${inputCls} mono-num`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Notas</label>
                <Input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} className={inputCls} placeholder="Opcional" />
              </div>
            </div>
          </div>
        )}

        {modo === "documento" && (
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Documento</label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger data-testid="mant-doc-tipo" className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Vence el</label>
              <Input data-testid="mant-doc-vence" type="date" required value={form.vence_en} onChange={(e) => setForm((f) => ({ ...f, vence_en: e.target.value }))} className={inputCls} />
            </div>
          </div>
        )}

        {modo === "gasto" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Categoría</label>
                <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                  <SelectTrigger data-testid="mant-gas-cat" className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS_GASTO.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Monto ($)</label>
                <Input data-testid="mant-gas-monto" type="number" required value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} className={`${inputCls} mono-num`} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Fecha</label>
              <Input data-testid="mant-gas-fecha" type="date" required value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className={inputCls} />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" data-testid="mant-cancelar" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" data-testid="mant-guardar" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </div>
  );
}

export function Mantenimiento({ liveSignal }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [modal, setModal] = useState(null); // {vehiculo, modo}

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      duenoApi.get("/dueno/mantenimiento/resumen"),
      duenoApi.get("/dueno/mantenimiento/gastos-por-mes"),
    ])
      .then(([r1, r2]) => { setData(r1.data); setGastos(r2.data); })
      .catch(() => setError("No se pudo cargar el estado de mantenimiento"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (liveSignal) load(); }, [liveSignal, load]);

  if (error) return <ErrorState description={error} onRetry={load} testId="dueno-mantenimiento-error" />;
  if (!data) return <LoadingState rows={4} testId="dueno-mantenimiento-loading" />;

  const { vehiculos, urgentes, proximos } = data;
  const maxGasto = Math.max(...gastos.map((g) => g.total), 1);

  return (
    <div className="space-y-6" data-testid="dueno-mantenimiento">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Mantenimiento</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Salud y control de servicio de tu flota. Cada tarjeta permite registrar servicios, documentos y gastos.</p>
      </div>

      {(urgentes > 0 || proximos > 0) && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold text-foreground">
              {urgentes > 0 ? `${urgentes} vehículo${urgentes > 1 ? "s" : ""} requiere${urgentes > 1 ? "n" : ""} atención urgente` : `${proximos} vehículo(s) con servicio próximo`}
            </div>
            <div className="text-xs text-muted-foreground">Revisa las tarjetas abajo para más detalle.</div>
          </div>
        </div>
      )}

      {vehiculos.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Sin vehículos registrados"
          description="Cuando tengas taxis asignados a tu flota, aquí verás su estado de mantenimiento."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehiculos.map((v) => (
            <div key={v.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`mantenimiento-vehiculo-${v.numero_economico}`}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="font-extrabold text-foreground">{v.numero_economico}</div>
                  <div className="text-xs text-muted-foreground">{v.marca || "Sin datos"} {v.modelo || ""}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ESTADO_TONE[v.salud.estado]}`}>
                  {ESTADO_LABEL[v.salud.estado]}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Gauge pct={v.salud.overall} />
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><GaugeIcon className="h-3 w-3" /> Salud del vehículo</div>
                  <div className="mt-0.5">{v.salud.odometro_km != null ? `${v.salud.odometro_km.toLocaleString("es-MX")} km` : "Sin odómetro capturado"}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Aceite</span><span className="font-semibold text-foreground">{v.salud.aceite}%</span></div>
                <div className="flex justify-between"><span>Llantas</span><span className="font-semibold text-foreground">{v.salud.llantas}%</span></div>
                <div className="flex justify-between"><span>Frenos</span><span className="font-semibold text-foreground">{v.salud.frenos}%</span></div>
                <div className="flex justify-between"><span>Documentos</span><span className="font-semibold text-foreground">{v.salud.documentos}%</span></div>
              </div>
              {/* Acciones de escritura (F9) */}
              <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-border pt-3">
                <Button data-testid={`mant-btn-registro-${v.numero_economico}`} size="sm" variant="secondary" className="!px-1 !text-[11px]"
                        onClick={() => setModal({ vehiculo: v, modo: "registro" })}>
                  <Plus className="h-3 w-3" /> Servicio
                </Button>
                <Button data-testid={`mant-btn-doc-${v.numero_economico}`} size="sm" variant="secondary" className="!px-1 !text-[11px]"
                        onClick={() => setModal({ vehiculo: v, modo: "documento" })}>
                  <Plus className="h-3 w-3" /> Documento
                </Button>
                <Button data-testid={`mant-btn-gasto-${v.numero_economico}`} size="sm" variant="secondary" className="!px-1 !text-[11px]"
                        onClick={() => setModal({ vehiculo: v, modo: "gasto" })}>
                  <Plus className="h-3 w-3" /> Gasto
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {gastos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">Gasto en mantenimiento por mes</h3>
          <div className="mt-4 flex h-28 items-end gap-2">
            {gastos.map((g) => (
              <div key={g._id} className="flex-1 text-center">
                <div
                  className="rounded-t-md bg-gradient-to-t from-brand to-brand-bright"
                  style={{ height: `${(g.total / maxGasto) * 100}%` }}
                />
                <div className="mt-1 text-[9px] text-muted-foreground">{g._id}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <AccionMantenimiento
          vehiculo={modal.vehiculo}
          modo={modal.modo}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

export default Mantenimiento;
