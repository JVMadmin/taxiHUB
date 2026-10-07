import { useCallback, useEffect, useMemo, useState } from "react";
import { termApi, BACKEND_URL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { semaforoServiciosStyle } from "@/lib/taxiIcon";
import { cn, resolveDriverAvatar, resolveVehicleImage } from "@/lib/utils";
import { PALETA } from "@/design/status";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { KPICard } from "@/components/KPICard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  User, Users, Building2, Car, Wrench, Fuel, ClipboardCheck, Ban, AlertTriangle, ChevronRight, FileText, Plus, Search, Phone, MapPin,
} from "@/design/icons";
import {
  Camera, ShieldCheck, Lock, X, Award, HeartPulse, BadgeCheck, FileCheck2, Star, Flame, CheckCircle2, Clock,
} from "lucide-react";

function resolveImgUrl(url, seed = 0) {
  return resolveDriverAvatar(url, seed);
}

const DOC_LABEL = {
  licencia: "Licencia Estatal Chofer Tipo B",
  ine: "Identificación Oficial (INE)",
  seguro: "Póliza RC Pasajero Vigente",
  tarjeton_sct: "Tarjetón de Identificación SCT",
  antidoping: "Certificado Toxicológico (Antidoping)",
  carta_antecedentes: "Constancia No Antecedentes Penales",
  comprobante_domicilio: "Comprobante de Domicilio",
};

function vigenciaBadge(estado) {
  if (estado === "vigente") {
    return { label: "VIGENTE", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" };
  }
  if (estado === "por_vencer") {
    return { label: "POR VENCER", cls: "border-amber-500/40 bg-amber-500/15 text-amber-300" };
  }
  if (estado === "faltante") {
    return { label: "FALTANTE", cls: "border-slate-500/40 bg-slate-500/15 text-slate-300" };
  }
  return { label: "VENCIDO", cls: "border-rose-500/40 bg-rose-500/15 text-rose-300" };
}

/* ============================================================================
 * 1. CHOFERES — Expediente Completo SCT / SEMOVI (Tamaño Chat WhatsApp 760px)
 *    Solo visible por la Operadora en la Terminal
 * ========================================================================== */
export function ChoferesPanel({ expedienteId, setExpedienteId, rutas = [], onDataChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [selectedId, setSelectedId] = useState(expedienteId || null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [nuevo, setNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [f, setF] = useState({
    nombre: "",
    telefono: "",
    placa: "",
    usuario: "",
    contrasena: "",
    ruta_asignada: "libre",
  });

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(() => {
    termApi
      .get("/terminal/conductores")
      .then((r) => {
        const list = r.data || [];
        setItems(list);
        setError(null);
        if (!selectedId && list.length > 0) {
          setSelectedId(expedienteId || list[0].id);
        }
      })
      .catch(() => setError("No se pudieron cargar los choferes"));
  }, [expedienteId, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (expedienteId) setSelectedId(expedienteId);
  }, [expedienteId]);

  const cargarExpediente = useCallback(async (id) => {
    if (!id) {
      setDetalle(null);
      return;
    }
    setCargandoDetalle(true);
    try {
      const { data } = await termApi.get(`/terminal/conductores/${id}`);
      setDetalle(data);
    } catch {
      setDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) cargarExpediente(selectedId);
  }, [selectedId, cargarExpediente]);

  const seleccionarChofer = (id) => {
    setSelectedId(id);
    setExpedienteId?.(id);
  };

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setFotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    if (!f.nombre || !f.usuario || !f.contrasena) {
      toast.error("Nombre, usuario y contraseña son requeridos");
      return;
    }
    setGuardando(true);
    try {
      const resp = await termApi.post("/operadores", {
        ...f,
        ruta_asignada: f.ruta_asignada === "libre" ? null : f.ruta_asignada,
      });

      const nuevoId = resp.data?.operador?.id;
      if (fotoFile && nuevoId) {
        const fd = new FormData();
        fd.append("foto", fotoFile);
        try {
          await termApi.post(`/perfil/operadores/${nuevoId}/foto`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (fotoErr) {
          console.warn("No se pudo subir la foto del nuevo chofer:", fotoErr);
        }
      }

      toast.success("Chofer registrado y comprimido en formato WebP seguro");
      setF({ nombre: "", telefono: "", placa: "", usuario: "", contrasena: "", ruta_asignada: "libre" });
      setFotoFile(null);
      setFotoPreview(null);
      setNuevo(false);
      load();
      if (nuevoId) seleccionarChofer(nuevoId);
      onDataChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo crear el chofer");
    } finally {
      setGuardando(false);
    }
  };

  const handleSubirFotoExistente = async (choferId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("foto", file);
    try {
      await termApi.post(`/perfil/operadores/${choferId}/foto`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Fotografía verificada y optimizada en WebP");
      load();
      if (selectedId === choferId) cargarExpediente(choferId);
      onDataChanged?.();
    } catch {
      toast.error("No se pudo actualizar la fotografía");
    }
  };

  const filtrados = useMemo(() => {
    if (!items) return [];
    const q = busqueda.trim().toLowerCase();
    return items.filter((c) => {
      if (filtroEstado === "libre" && c.estado !== "libre") return false;
      if (filtroEstado === "ocupado" && c.estado !== "ocupado") return false;
      if (filtroEstado === "alerta" && c.licencia_estado === "vigente") return false;
      if (filtroEstado === "activos" && c.estado === "fuera_de_servicio") return false;
      if (!q) return true;
      return (
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.usuario || "").toLowerCase().includes(q) ||
        (c.telefono || "").includes(q) ||
        (c.curp || "").toLowerCase().includes(q) ||
        (c.licencia_numero || "").toLowerCase().includes(q) ||
        (c.placa || "").toLowerCase().includes(q) ||
        (c.vehiculo?.numero_economico || "").toLowerCase().includes(q)
      );
    });
  }, [items, busqueda, filtroEstado]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={4} />;

  const cond = detalle?.conductor || filtrados.find((x) => x.id === selectedId) || items[0];
  const unidad = detalle?.unidad || cond?.vehiculo || null;
  const docsTodos = [...(detalle?.documentos || []), ...(detalle?.documentos_sct || [])];
  const semHoy = semaforoServiciosStyle(cond?.servicios_hoy ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="terminal-choferes">
      {/* Cabecera superior con buscador, filtros y botón de alta */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, unidad, CURP, licencia o teléfono…"
            className="h-9 pl-9 text-xs"
            data-testid="buscar-choferes-input"
          />
        </div>
        <Button
          type="button"
          onClick={() => setNuevo((v) => !v)}
          className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs"
          data-testid="nuevo-chofer-btn"
        >
          {nuevo ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {nuevo ? "Cerrar alta" : "Nuevo chofer"}
        </Button>
      </div>

      {/* Chips de filtrado rápido de expediente */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: "todos", label: `Todos (${items.length})` },
          { id: "libre", label: `Libres (${items.filter((x) => x.estado === "libre").length})` },
          { id: "ocupado", label: `Ocupados (${items.filter((x) => x.estado === "ocupado").length})` },
          { id: "activos", label: "En servicio" },
          { id: "alerta", label: "Licencia por vencer" },
        ].map((fChip) => (
          <button
            key={fChip.id}
            type="button"
            onClick={() => setFiltroEstado(fChip.id)}
            data-testid={`choferes-filtro-${fChip.id}`}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all",
              filtroEstado === fChip.id
                ? "border-[#4F5DFF] bg-[#4F5DFF]/20 text-white shadow-sm"
                : "border-white/10 bg-[#17191E] text-muted-foreground hover:text-foreground"
            )}
          >
            {fChip.label}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 sm:inline-flex">
          <ShieldCheck className="h-3 w-3" /> Solo visible para Operadora
        </span>
      </div>

      {/* Formulario desplegable de Alta de Chofer */}
      {nuevo && (
        <form
          onSubmit={handleCrear}
          className="animate-slide-up space-y-3 rounded-2xl border border-brand/30 bg-surface-2 p-3.5 shadow-xl"
          data-testid="form-nuevo-chofer"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-bright">
              Alta de Conductor / Expediente SCT
            </span>
            <span className="text-[11px] text-muted-foreground">Compresión WebP automática por tenant</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface-3 transition-colors hover:border-brand">
              {fotoPreview ? (
                <img src={fotoPreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Camera className="h-5 w-5" />
                  <span className="text-[9px] font-semibold">Foto</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                className="hidden"
                data-testid="chofer-foto-input"
              />
            </label>
            <div className="grid flex-1 grid-cols-2 gap-2">
              <Input
                value={f.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Nombre completo *"
                required
                className="h-8 text-xs"
                data-testid="chofer-nombre"
              />
              <Input
                value={f.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="Teléfono celular"
                className="h-8 text-xs"
                data-testid="chofer-telefono"
              />
              <Input
                value={f.usuario}
                onChange={(e) => set("usuario", e.target.value)}
                placeholder="Usuario (app) *"
                required
                className="h-8 text-xs"
                data-testid="chofer-usuario"
              />
              <Input
                type="password"
                value={f.contrasena}
                onChange={(e) => set("contrasena", e.target.value)}
                placeholder="Contraseña *"
                required
                className="h-8 text-xs"
                data-testid="chofer-contrasena"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              value={f.placa}
              onChange={(e) => set("placa", e.target.value)}
              placeholder="Económico / Placa"
              className="h-8 text-xs"
              data-testid="chofer-placa"
            />
            <select
              value={f.ruta_asignada}
              onChange={(e) => set("ruta_asignada", e.target.value)}
              className="h-8 rounded-xl border border-white/[0.08] bg-[#1B1E24] px-2 text-xs text-[#F5F5F7] focus:border-brand focus:outline-none"
              data-testid="chofer-ruta"
            >
              <option value="libre">Taxi libre (sin ruta fija)</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={guardando} className="h-8 text-xs" data-testid="chofer-guardar-btn">
              {guardando ? "Guardando…" : "Registrar Chofer"}
            </Button>
          </div>
        </form>
      )}

      {/* Vista Maestra-Detalle del tamaño del panel de WhatsApp */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-12">
        {/* Columna izquierda: Lista filtrada de Choferes */}
        <div className="no-scrollbar flex max-h-[64vh] flex-col gap-1.5 overflow-y-auto pr-0.5 md:col-span-5">
          {filtrados.map((c, idx) => {
            const isSel = c.id === (cond?.id || selectedId);
            const svSem = semaforoServiciosStyle(c.servicios_hoy ?? 0);
            const avatarSrc = resolveImgUrl(c.foto_url, c.id || idx);
            return (
              <div
                key={c.id}
                data-testid={`terminal-chofer-${c.id}`}
                onClick={() => seleccionarChofer(c.id)}
                className={cn(
                  "group flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all",
                  isSel
                    ? "border-[#4F5DFF] bg-[#4F5DFF]/15 shadow-md"
                    : "border-white/[0.07] bg-[#17191E] hover:border-white/20 hover:bg-[#1B1E24]"
                )}
              >
                <div className="relative shrink-0">
                  <img
                    src={avatarSrc}
                    alt={c.nombre}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `/assets/drivers/driver-${String((idx % 15) + 1).padStart(2, "0")}.jpg`;
                    }}
                    className="h-12 w-12 rounded-xl border border-white/15 object-cover shadow"
                  />
                  <span
                    style={{ background: svSem.bg, color: svSem.text, borderColor: svSem.border }}
                    className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1 font-mono text-[10px] font-black shadow"
                    title={`Servicios hoy: ${svSem.count}`}
                  >
                    {svSem.count}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-foreground">{c.nombre}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono font-bold text-amber-300">
                      {c.vehiculo?.numero_economico || c.placa || "S/U"}
                    </span>
                    <span>·</span>
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {c.socio_nombre ? `Socio: ${c.socio_nombre}` : c.telefono || `@${c.usuario}`}
                  </div>
                </div>
                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isSel ? "text-[#4F5DFF] translate-x-0.5" : "text-muted-foreground")} />
              </div>
            );
          })}
          {filtrados.length === 0 && (
            <EmptyState icon={Users} title="Sin resultados" description="Ningún chofer coincide con el filtro activo." />
          )}
        </div>

        {/* Columna derecha: Expediente Completo SCT / SEMOVI del Chofer Seleccionado */}
        <div
          className="no-scrollbar max-h-[64vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#14161B] p-3.5 md:col-span-7"
          data-testid="expediente-chofer-detalle"
        >
          {cargandoDetalle && !cond ? (
            <LoadingState rows={4} />
          ) : !cond ? (
            <EmptyState icon={User} title="Selecciona un chofer" description="Haz clic en un operador para abrir su expediente SCT." />
          ) : (
            <div className="space-y-3.5">
              {/* Tarjeta principal con fotografía grande visible por la operadora */}
              <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#1B1E24] p-3 sm:flex-row sm:items-center">
                <div className="relative shrink-0 self-start">
                  <img
                    src={resolveImgUrl(cond.foto_url, cond.id || cond.nombre)}
                    alt={cond.nombre}
                    data-testid="expediente-chofer-foto"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/assets/drivers/driver-01.jpg";
                    }}
                    className="h-20 w-20 rounded-2xl border-2 border-[#4F5DFF]/50 object-cover shadow-lg"
                  />
                  <label
                    title="Actualizar fotografía del expediente (WebP)"
                    className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#4F5DFF] text-white shadow-md hover:bg-[#3D49D6]"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSubirFotoExistente(cond.id, e)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-extrabold text-white">{cond.nombre}</h4>
                    <EstadoBadge estado={cond.estado} pulse />
                    <span
                      style={{ background: semHoy.bg, color: semHoy.text, borderColor: semHoy.border }}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-black shadow"
                    >
                      {semHoy.count} servicios hoy
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-foreground/90">
                      <Phone className="h-3 w-3 text-[#7CFC3C]" /> {cond.telefono || "Sin teléfono"}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-amber-300">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {cond.calificacion || "4.9"} ★
                    </span>
                    <span className="font-mono text-[11px]">@{cond.usuario}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <MapPin className="mr-1 inline h-3 w-3 text-sky-400" />
                    {cond.domicilio || "Col. Centro, Palenque, Chiapas"}
                  </div>
                </div>
              </div>

              {/* Bloque 1: Identificación Oficial y Seguridad Social (SCT / IMSS) */}
              <div className="rounded-xl border border-white/[0.06] bg-[#181B20] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-400">
                    <BadgeCheck className="h-3.5 w-3.5" /> Datos Oficiales SCT / SEMOVI / IMSS
                  </span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    {cond.antidoping_resultado || "ANTIDOPING: NEGATIVO (APTO)"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">CURP</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] font-bold text-foreground">
                      {cond.curp || "GOMA880512HCHLRR01"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">RFC (SAT)</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-foreground">
                      {cond.rfc || "GOMA880512AB1"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">NSS (IMSS) / Sangre</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-emerald-300">
                      {cond.nss_imss || "07148920101"} · <span className="text-rose-400">{cond.tipo_sangre || "O+"}</span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Licencia Chofer Público</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-amber-300">
                      {cond.licencia_numero || "CH-LIC-2026-001"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Tarjetón SCT</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-indigo-300">
                      {cond.tarjeton_sct || "SCT-TAR-916-01"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Vigencia Licencia</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-foreground">
                      {cond.licencia_vence_en || "2027-11-15"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 2: Contacto de Emergencia y Unidad Asignada */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-300">
                    <HeartPulse className="h-3.5 w-3.5" /> Contacto de Emergencia
                  </div>
                  <div className="mt-1.5 text-xs font-bold text-foreground">
                    {cond.contacto_emergencia || "María López (Esposa)"}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-rose-300">
                    Tel: {cond.telefono_emergencia || "916-105-8810"}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Infracciones SCT: <strong className="text-foreground">{cond.infracciones_sct ?? 0}</strong> · Históricos:{" "}
                    <strong className="text-foreground">{cond.servicios_historicos ?? detalle?.servicios_completados ?? 0}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    <Car className="h-3.5 w-3.5" /> Unidad y Concesionario
                  </div>
                  {unidad ? (
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <img
                        src={resolveVehicleImage(unidad)}
                        alt={unidad.numero_economico}
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/vehicles/generico.png"; }}
                        className="h-11 w-14 shrink-0 rounded-lg border border-white/10 bg-black/25 object-contain p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs font-bold text-foreground">
                          <span className="font-mono text-amber-300">{unidad.numero_economico}</span>
                          <span className="font-mono text-[11px]">{unidad.placa || "CH-410-TX"}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {[unidad.marca, unidad.modelo, unidad.anio].filter(Boolean).join(" ")}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          Socio: <strong className="text-foreground">{unidad.socio || cond.socio_nombre || "Concesionario Central"}</strong> · Cuota:{" "}
                          <strong className="text-emerald-300">${unidad.cuota_diaria || 420}/día</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">Sin unidad asignada actualmente</div>
                  )}
                </div>
              </div>

              {/* Bloque 3: Documentación y Certificaciones del Expediente */}
              <div className="rounded-xl border border-white/[0.06] bg-[#181B20] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <FileCheck2 className="h-3.5 w-3.5 text-brand-bright" /> Documentación en Expediente ({docsTodos.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {docsTodos.map((d, idx) => {
                    const vb = vigenciaBadge(d.estado);
                    return (
                      <div
                        key={`${d.tipo}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-black/25 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {DOC_LABEL[d.tipo] || d.tipo}
                          </div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {d.numero || "Sin folio"} {d.vence_en ? `· Vence ${d.vence_en}` : ""}
                          </div>
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold", vb.cls)}>
                          {vb.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bloque 4: últimos servicios del operador */}
              {detalle?.servicios_recientes?.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-[#181B20] p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Últimos Servicios Despachados
                  </div>
                  <div className="space-y-1.5">
                    {detalle.servicios_recientes.slice(0, 4).map((sv) => (
                      <div key={sv.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px]">
                        <span className="truncate text-foreground/90">
                          {sv.origen?.texto || "Origen"} → {sv.destino?.texto || "Destino"}
                        </span>
                        <span className="shrink-0 font-mono font-bold text-emerald-400">
                          {sv.costo ? `$${sv.costo}` : sv.estado}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. SOCIOS — Expediente Completo de Concesionario SCT (Tamaño WhatsApp 760px)
 *    Solo visible por la Operadora en la Terminal
 * ========================================================================== */
export function SociosPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [passwordVerif, setPasswordVerif] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [fSocio, setFSocio] = useState({ nombre: "", usuario: "", contrasena: "", telefono: "", rfc: "", concesion_folio: "" });

  const load = useCallback(() => {
    termApi
      .get("/terminal/socios")
      .then((r) => {
        const list = r.data || [];
        setItems(list);
        setError(null);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      })
      .catch(() => setError("No se pudieron cargar los socios"));
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const cargarSocioDetalle = useCallback(async (id) => {
    if (!id) return;
    setCargandoDetalle(true);
    try {
      const { data } = await termApi.get(`/terminal/socios/${id}`);
      setDetalle(data);
    } catch {
      setDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) cargarSocioDetalle(selectedId);
  }, [selectedId, cargarSocioDetalle]);

  const handleSubirFotoSocio = async (socioId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("foto", file);
    try {
      await termApi.post(`/perfil/socios/${socioId}/foto`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Fotografía del socio actualizada y optimizada en WebP");
      load();
      cargarSocioDetalle(socioId);
    } catch {
      toast.error("No se pudo actualizar la fotografía del socio");
    }
  };

  const handleVerificar = async (e) => {
    e.preventDefault();
    if (!passwordVerif) {
      toast.error("Ingresa tu contraseña de operadora");
      return;
    }
    setVerificando(true);
    try {
      const usuario = localStorage.getItem("terminal_user") || "central";
      await termApi.post("/terminal/login", { usuario, contrasena: passwordVerif });
      toast.success("Autorización confirmada");
      setShowVerifyModal(false);
      setShowCreateModal(true);
      setPasswordVerif("");
    } catch {
      toast.error("Contraseña de operadora incorrecta. Autorización rechazada.");
    } finally {
      setVerificando(false);
    }
  };

  const handleCrearSocio = async (e) => {
    e.preventDefault();
    if (!fSocio.nombre || !fSocio.usuario || !fSocio.contrasena) {
      toast.error("Nombre, usuario y contraseña son obligatorios");
      return;
    }
    setCreando(true);
    try {
      await termApi.post("/dueno/usuarios", fSocio);
      toast.success("Socio concesionario dado de alta exitosamente");
      setFSocio({ nombre: "", usuario: "", contrasena: "", telefono: "", rfc: "", concesion_folio: "" });
      setShowCreateModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo registrar el socio");
    } finally {
      setCreando(false);
    }
  };

  const filtrados = useMemo(() => {
    if (!items) return [];
    const q = busqueda.trim().toLowerCase();
    return items.filter((s) => {
      if (filtro === "corriente" && s.estatus_cuota_sitio && s.estatus_cuota_sitio !== "Al corriente") return false;
      if (filtro === "multi" && (s.unidades || 0) < 2) return false;
      if (!q) return true;
      return (
        (s.nombre || "").toLowerCase().includes(q) ||
        (s.usuario || "").toLowerCase().includes(q) ||
        (s.rfc || "").toLowerCase().includes(q) ||
        (s.concesion_folio || "").toLowerCase().includes(q) ||
        (s.telefono || "").includes(q)
      );
    });
  }, [items, busqueda, filtro]);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={3} />;

  const socioSel = detalle?.socio || filtrados.find((x) => x.id === selectedId) || items[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="terminal-socios">
      {/* Barra superior: Buscador + Nuevo Socio */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar socio por nombre, concesión SCT, RFC o teléfono…"
            className="h-9 pl-9 text-xs"
            data-testid="buscar-socios-input"
          />
        </div>
        <Button
          type="button"
          onClick={() => setShowVerifyModal(true)}
          className="flex h-9 items-center gap-1.5 px-3 text-xs"
          data-testid="nuevo-socio-btn"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo socio
        </Button>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: "todos", label: `Todos los Socios (${items.length})` },
          { id: "corriente", label: "Cuota al corriente" },
          { id: "multi", label: "Flota 2+ unidades" },
        ].map((fc) => (
          <button
            key={fc.id}
            type="button"
            onClick={() => setFiltro(fc.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all",
              filtro === fc.id
                ? "border-[#4F5DFF] bg-[#4F5DFF]/20 text-white"
                : "border-white/10 bg-[#17191E] text-muted-foreground hover:text-foreground"
            )}
          >
            {fc.label}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 sm:inline-flex">
          <ShieldCheck className="h-3 w-3" /> Expediente exclusivo Operadora
        </span>
      </div>

      {/* MODAL 1: Verificación de Autorización Requerida */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-scale-in space-y-3 rounded-2xl border border-warning/40 bg-surface p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Verificación de Seguridad</div>
                <div className="text-[11px] text-muted-foreground">Paso de autorización requerido</div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              El alta de un nuevo socio concesionario impacta la vinculación de unidades del sitio. Ingresa tu contraseña de operadora para continuar.
            </p>

            <form onSubmit={handleVerificar} className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  autoFocus
                  value={passwordVerif}
                  onChange={(e) => setPasswordVerif(e.target.value)}
                  placeholder="Contraseña de operadora"
                  className="h-9 pl-9 text-xs"
                  data-testid="verif-password-input"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowVerifyModal(false); setPasswordVerif(""); }}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={verificando} className="h-8 text-xs" data-testid="confirmar-verif-btn">
                  {verificando ? "Verificando..." : "Verificar y Desbloquear"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Formulario de Alta de Socio */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-scale-in space-y-3 rounded-2xl border border-brand/40 bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="text-sm font-bold text-foreground">Registrar Nuevo Socio Concesionario</div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCrearSocio} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Nombre o Razón Social</label>
                <Input
                  value={fSocio.nombre}
                  onChange={(e) => setFSocio((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej. Roberto Palenque — Grupo Maya"
                  required
                  className="mt-1 h-8 text-xs"
                  data-testid="socio-nombre"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Usuario para Portal de Socio</label>
                <Input
                  value={fSocio.usuario}
                  onChange={(e) => setFSocio((p) => ({ ...p, usuario: e.target.value }))}
                  placeholder="Ej. socio_sureste"
                  required
                  className="mt-1 h-8 text-xs"
                  data-testid="socio-usuario"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Contraseña de Acceso</label>
                <Input
                  type="password"
                  value={fSocio.contrasena}
                  onChange={(e) => setFSocio((p) => ({ ...p, contrasena: e.target.value }))}
                  placeholder="Contraseña inicial"
                  required
                  className="mt-1 h-8 text-xs"
                  data-testid="socio-contrasena"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} className="h-8 text-xs">
                  Cancelar
                </Button>
                <Button type="submit" disabled={creando} className="h-8 text-xs" data-testid="guardar-socio-btn">
                  {creando ? "Registrando..." : "Guardar Socio"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vista Maestra-Detalle de Socios (760px estilo WhatsApp) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-12">
        {/* Lista izquierda de Socios */}
        <div className="no-scrollbar flex max-h-[64vh] flex-col gap-2 overflow-y-auto pr-0.5 md:col-span-5">
          {filtrados.map((s, idx) => {
            const isSel = s.id === (socioSel?.id || selectedId);
            const fotoSrc = resolveImgUrl(s.foto_url, s.id || idx);
            return (
              <div
                key={s.id}
                data-testid={`terminal-socio-${s.id}`}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all",
                  isSel
                    ? "border-[#4F5DFF] bg-[#4F5DFF]/15 shadow-md"
                    : "border-white/[0.07] bg-[#17191E] hover:border-white/20 hover:bg-[#1B1E24]"
                )}
              >
                <img
                  src={fotoSrc}
                  alt={s.nombre}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `/assets/drivers/driver-${String((idx % 15) + 1).padStart(2, "0")}.jpg`;
                  }}
                  className="h-12 w-12 shrink-0 rounded-xl border border-white/15 object-cover shadow"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-foreground">{s.nombre}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-amber-300 font-mono">
                    <span>{s.concesion_folio || "SCT-CHIS-PAL-2026"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{s.unidades} unidad(es) · @{s.usuario}</span>
                    <span className="text-emerald-400 font-bold">{s.estatus_cuota_sitio || "Al corriente"}</span>
                  </div>
                </div>
                <ChevronRight className={cn("h-4 w-4 shrink-0", isSel ? "text-[#4F5DFF]" : "text-muted-foreground")} />
              </div>
            );
          })}
          {filtrados.length === 0 && (
            <EmptyState icon={Building2} title="Sin socios" description="No se encontraron socios con ese criterio." />
          )}
        </div>

        {/* Detalle derecho: Expediente Completo del Socio Concesionario */}
        <div
          className="no-scrollbar max-h-[64vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#14161B] p-3.5 md:col-span-7"
          data-testid="expediente-socio-detalle"
        >
          {cargandoDetalle && !socioSel ? (
            <LoadingState rows={3} />
          ) : !socioSel ? (
            <EmptyState icon={Building2} title="Selecciona un socio" description="Haz clic en un concesionario para ver su expediente SCT." />
          ) : (
            <div className="space-y-3.5">
              {/* Cabecera con foto del socio visible para la operadora */}
              <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#1B1E24] p-3 sm:flex-row sm:items-center">
                <div className="relative shrink-0 self-start">
                  <img
                    src={resolveImgUrl(socioSel.foto_url, socioSel.id || socioSel.nombre)}
                    alt={socioSel.nombre}
                    data-testid="expediente-socio-foto"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/assets/drivers/driver-01.jpg";
                    }}
                    className="h-20 w-20 rounded-2xl border-2 border-amber-400/50 object-cover shadow-lg"
                  />
                  <label
                    title="Actualizar fotografía del socio (WebP)"
                    className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#4F5DFF] text-white shadow-md hover:bg-[#3D49D6]"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSubirFotoSocio(socioSel.id, e)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-extrabold text-white">{socioSel.nombre}</h4>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      {socioSel.estatus_cuota_sitio || "Al corriente"}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-amber-300">
                    {socioSel.modalidad_sct || "Concesión Servicio Público de Transporte en Taxi"}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span><Phone className="mr-1 inline h-3 w-3 text-[#7CFC3C]" />{socioSel.telefono || "916-345-1001"}</span>
                    <span>{socioSel.email || `@${socioSel.usuario}`}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {socioSel.domicilio || "Av. Juárez, Col. Centro, Palenque, Chiapas"}
                  </div>
                </div>
              </div>

              {/* Datos de Concesión SCT y Póliza Colectiva */}
              <div className="rounded-xl border border-white/[0.06] bg-[#181B20] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    <Award className="h-3.5 w-3.5" /> Título de Concesión SCT y Datos Fiscales
                  </span>
                  <span className="font-mono text-[10px] text-emerald-300">
                    Vigencia: {socioSel.vigencia_concesion || "2030-12-31"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Folio Concesión SCT</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-amber-300">
                      {socioSel.concesion_folio || "SCT-CHIS-PAL-00142"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">RFC Fiscal</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-foreground">
                      {socioSel.rfc || "PAGR750412CH1"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Póliza Seguro Flota</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] font-bold text-sky-300">
                      {socioSel.poliza_flota || "QUALITAS-FLOTA-9981"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Aseguradora</div>
                    <div className="mt-0.5 text-[11px] font-bold text-foreground">
                      {socioSel.aseguradora || "Quálitas RC Pasajero"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Unidades Activas</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-emerald-400">
                      {detalle?.unidades ?? socioSel.unidades ?? 0} taxis
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-muted-foreground">Cuota Diaria Flota</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold text-emerald-300">
                      ${detalle?.cuota_diaria_flota ?? 2100} MXN/día
                    </div>
                  </div>
                </div>
              </div>

              {/* Parque Vehicular y Conductores Asignados (con fotos visibles) */}
              <div className="rounded-xl border border-white/[0.06] bg-[#181B20] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Car className="h-3.5 w-3.5 text-brand-bright" /> Unidades Concesionadas y Choferes Asignados (
                    {detalle?.vehiculos?.length || 0})
                  </span>
                </div>
                <div className="space-y-2">
                  {(detalle?.vehiculos || []).map((v, vIdx) => {
                    const chFoto = resolveImgUrl(v.conductor_foto, v.id || vIdx);
                    const vehImg = resolveVehicleImage(v);
                    return (
                      <div
                        key={v.id}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.06] bg-black/25 p-2.5 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <img
                            src={chFoto}
                            alt={v.conductor || ""}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = `/assets/drivers/driver-${String((vIdx % 15) + 1).padStart(2, "0")}.jpg`;
                            }}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover border border-white/15"
                          />
                          <img
                            src={vehImg}
                            alt={v.numero_economico}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/vehicles/generico.png"; }}
                            className="h-10 w-13 shrink-0 rounded-lg object-contain bg-black/20 p-1 border border-white/10"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-amber-300">{v.numero_economico}</span>
                              <span className="truncate font-semibold text-foreground">
                                {[v.marca, v.modelo, v.anio].filter(Boolean).join(" ")}
                              </span>
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              Chofer: <strong className="text-foreground/90">{v.conductor || "Sin asignar"}</strong>
                              {v.placa ? ` · Placa ${v.placa}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs font-bold text-emerald-400">
                            ${v.cuota_diaria || 420}/día
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {v.odometro_km ? `${Number(v.odometro_km).toLocaleString("es-MX")} km` : "Activo"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(!detalle?.vehiculos || detalle.vehiculos.length === 0) && (
                    <div className="text-xs text-muted-foreground">Sin unidades vinculadas a este socio.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mantenimiento (consulta) ---------------- */
export function MantenimientoPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/mantenimiento").then((r) => setData(r.data)).catch(() => setError("No se pudo cargar mantenimiento"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-mantenimiento">
      <p className="text-[11px] text-muted-foreground">Solo consulta. El registro de mantenimientos lo realiza el socio.</p>
      {data.vehiculos.map((v) => (
        <div key={v.vehiculo_id} className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-foreground">{v.numero_economico}</span>
            <span className="mono-num text-xs text-muted-foreground">{v.odometro_km != null ? `${v.odometro_km.toLocaleString("es-MX")} km` : "sin odómetro"}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {v.ultimo ? `Último: ${v.ultimo.tipo} · ${timeAgo(v.ultimo.realizado_en)}${v.ultimo.costo ? ` · ${fmtMoney(v.ultimo.costo)}` : ""}` : "Sin mantenimientos registrados"}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Combustible (consulta §27) ---------------- */
export function CombustiblePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/combustible").then((r) => setData(r.data)).catch(() => setError("No se pudo cargar combustible"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2" data-testid="terminal-combustible">
      <p className="text-[11px] text-muted-foreground">Solo consulta. Las cargas las registran el taxista (y el socio si lo requiere).</p>
      {data.cargas.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{c.unidad}</span>
            <span className="mono-num text-sm font-bold text-brand-bright">{fmtMoney(c.costo)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.fecha} · {c.litros} L · {c.odometro_km?.toLocaleString("es-MX")} km · por {c.registro_por}
            {c.estacion ? ` · ${c.estacion}` : ""}
          </div>
        </div>
      ))}
      {data.cargas.length === 0 && <EmptyState icon={Fuel} title="Sin cargas" description="Las cargas de combustible aparecerán aquí." />}
    </div>
  );
}

/* ============================================================================
 * 3. DASHBOARD DEL SITIO (F16 + Focos de Servicios por Colores por Zona)
 * ========================================================================== */
export function DashboardPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    termApi.get("/terminal/dashboard").then((r) => { setData(r.data); }).catch(() => setError("No se pudo cargar el dashboard"));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return <LoadingState rows={4} />;
  const e = data.estados;
  const focos = data.focos_por_zona || [];

  return (
    <div className="space-y-4" data-testid="terminal-dashboard">
      <div className="grid grid-cols-2 gap-3">
        <KPICard icon={ClipboardCheck} label="Servicios hoy" value={data.servicios_hoy} tone="good" />
        <KPICard icon={ClipboardCheck} label="Activos ahora" value={data.servicios_activos} tone="brand" />
        <KPICard icon={ClipboardCheck} label="Completados (mes)" value={data.completados_mes} tone="brand" />
        <KPICard icon={Ban} label="Cancelados (mes)" value={data.cancelados_mes} />
        <KPICard icon={Car} label="Unidades" value={data.unidades} />
        <KPICard icon={Users} label="Conductores" value={data.conductores} />
        <KPICard icon={Building2} label="Socios" value={data.socios} />
        <KPICard icon={FileText} label="Zonas activas" value={focos.length || 6} />
      </div>

      {/* Focos de Servicios por Colores por Zona */}
      <div className="rounded-xl border border-border bg-surface-2 p-3.5" data-testid="dashboard-focos-zona">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
            <Flame className="h-4 w-4 text-rose-400" /> Focos de Servicios por Zona (Demanda por Color)
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1 text-rose-400">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Alto
            </span>
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Medio
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Estable
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {focos.map((f) => (
            <div
              key={f.zona}
              className="rounded-xl border border-white/[0.07] p-2.5 transition-all"
              style={{ background: f.bg || "rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full shadow"
                    style={{ background: f.color, boxShadow: `0 0 8px ${f.color}` }}
                  />
                  <span className="truncate font-bold text-foreground">{f.zona}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
                    style={{ background: f.color }}
                  >
                    {f.nivel}
                  </span>
                  <span className="font-mono text-xs font-black text-foreground">
                    {f.servicios} sv
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(8, f.porcentaje || 10)}%`, background: f.color }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Tarifa base zona: ${f.tarifa_base || 40} MXN</span>
                <span className="font-mono text-emerald-300">Volumen: {fmtMoney(f.ingresos)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Estados de flota</div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {[["libre", "Disponibles", PALETA.success], ["ocupado", "Ocupados", PALETA.danger],
            ["no_disponible", "Pausados", PALETA.warning], ["fuera_de_servicio", "Offline", PALETA.offline],
            ["averiado", "Averiados", PALETA.purple]].map(([k, l, c]) => (
            <div key={k} className="rounded-lg bg-card/70 p-1.5">
              <div className="mono-num text-lg font-extrabold" style={{ color: c }}>{e[k] ?? 0}</div>
              <div className="text-[9px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString("es-MX")}`;
}
