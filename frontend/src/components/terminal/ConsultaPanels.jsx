import { useCallback, useEffect, useState } from "react";
import { termApi, BACKEND_URL } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PALETA } from "@/design/status";
import { EstadoBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { KPICard } from "@/components/KPICard";
import { Expediente } from "@/pages/dueno/Expediente";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  User, Users, Building2, Car, Wrench, Fuel, ClipboardCheck, Ban, AlertTriangle, ChevronRight, FileText, Plus, Search,
} from "@/design/icons";
import { Camera, ShieldCheck, Lock, X } from "lucide-react";

/**
 * Paneles de la Terminal: Choferes (con gestión y alta fusionada), Socios (con alta protegida),
 * mantenimiento, combustible y dashboard.
 */

/* ---------------- Choferes: Fusión de Gestión + Alta + Fotos + Expediente ---------------- */
export function ChoferesPanel({ expedienteId, setExpedienteId, rutas = [], onDataChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
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
      .then((r) => setItems(r.data))
      .catch(() => setError("No se pudieron cargar los choferes"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      toast.success("Chofer registrado exitosamente");
      setF({
        nombre: "",
        telefono: "",
        placa: "",
        usuario: "",
        contrasena: "",
        ruta_asignada: "libre",
      });
      setFotoFile(null);
      setFotoPreview(null);
      setNuevo(false);
      load();
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
      toast.success("Fotografía actualizada");
      load();
      onDataChanged?.();
    } catch (err) {
      toast.error("No se pudo subir la fotografía");
    }
  };

  if (expedienteId) {
    return (
      <Expediente
        conductorId={expedienteId}
        onBack={() => setExpedienteId(null)}
        api={termApi}
        basePath="/terminal"
      />
    );
  }

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={3} />;

  const filtrados = items.filter((c) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.nombre || "").toLowerCase().includes(q) ||
      (c.usuario || "").toLowerCase().includes(q) ||
      (c.telefono || "").includes(q) ||
      (c.vehiculo?.numero_economico || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3" data-testid="terminal-choferes">
      {/* Barra de control: Buscador + Botón Alta */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por chofer, unidad o teléfono..."
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
          {nuevo ? "Cancelar" : "Nuevo chofer"}
        </Button>
      </div>

      {/* Formulario integrado de Alta de Chofer con Fotografía */}
      {nuevo && (
        <form
          onSubmit={handleCrear}
          className="animate-slide-up space-y-3 rounded-2xl border border-brand/30 bg-surface-2 p-3.5 shadow-xl"
          data-testid="form-nuevo-chofer"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-bright">
              Alta de Conductor / Chofer
            </span>
            <span className="text-[11px] text-muted-foreground">Flota Humana</span>
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
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs font-semibold text-foreground">Fotografía del Chofer</div>
              <div className="text-[11px] text-muted-foreground">
                Sube una imagen frontal clara para su expediente y avatar.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
              placeholder="Teléfono"
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

          <div className="grid grid-cols-2 gap-2">
            <Input
              value={f.placa}
              onChange={(e) => set("placa", e.target.value)}
              placeholder="Placa / Unidad sugerida"
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
          </div>

          <Button
            type="submit"
            disabled={guardando}
            className="w-full text-xs"
            data-testid="chofer-guardar-btn"
          >
            {guardando ? "Guardando chofer..." : "Registrar Chofer"}
          </Button>
        </form>
      )}

      {/* Lista de Choferes */}
      <div className="space-y-2">
        {filtrados.map((c) => (
          <div
            key={c.id}
            data-testid={`terminal-chofer-${c.id}`}
            className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-brand/40"
          >
            {/* Avatar con foto y botón de actualización */}
            <div className="relative shrink-0">
              {c.foto_url ? (
                <img
                  src={`${BACKEND_URL}${c.foto_url}`}
                  alt={c.nombre}
                  className="h-10 w-10 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-bright">
                  {(c.nombre || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <label
                title="Cambiar fotografía"
                className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-surface shadow transition-transform hover:scale-110"
              >
                <Camera className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSubirFotoExistente(c.id, e)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Datos del chofer */}
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => setExpedienteId(c.id)}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-foreground hover:text-brand-bright">
                  {c.nombre}
                </span>
                <EstadoBadge estado={c.estado} />
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {c.vehiculo ? `Unidad ${c.vehiculo.numero_economico}` : "Sin unidad"} ·{" "}
                {c.telefono || "Sin tel"} · @{c.usuario || "op"}
              </div>
            </div>

            {/* Acción: Ver Expediente Completo */}
            <button
              type="button"
              onClick={() => setExpedienteId(c.id)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-brand-bright"
              title="Ver expediente y documentación"
            >
              <span className="hidden sm:inline">Expediente</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
        {filtrados.length === 0 && (
          <EmptyState
            icon={Users}
            title="Sin choferes"
            description="No se encontraron choferes registrados o que coincidan con la búsqueda."
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- Socios: Consulta + Alta Protegida con Verificación ---------------- */
export function SociosPanel({ expedienteId, setExpedienteId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [passwordVerif, setPasswordVerif] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [fSocio, setFSocio] = useState({ nombre: "", usuario: "", contrasena: "" });

  const load = useCallback(() => {
    termApi
      .get("/terminal/socios")
      .then((r) => setItems(r.data))
      .catch(() => setError("No se pudieron cargar los socios"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (err) {
      toast.error("Contraseña de operadora incorrecta. Autorización rechazada.");
    } finally {
      setVerificando(false);
    }
  };

  const handleCrearSocio = async (e) => {
    e.preventDefault();
    if (!fSocio.nombre || !fSocio.usuario || !fSocio.contrasena) {
      toast.error("Todos los campos son obligatorios");
      return;
    }
    setCreando(true);
    try {
      await termApi.post("/dueno/usuarios", fSocio);
      toast.success("Socio dado de alta exitosamente");
      setFSocio({ nombre: "", usuario: "", contrasena: "" });
      setShowCreateModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo registrar el socio");
    } finally {
      setCreando(false);
    }
  };

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!items) return <LoadingState rows={3} />;

  return (
    <div className="space-y-3" data-testid="terminal-socios">
      {/* Cabecera con botón de Nuevo Socio */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-foreground">Directorio de Socios</div>
          <div className="text-[11px] text-muted-foreground">Propietarios de flota y liquidaciones</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowVerifyModal(true)}
          className="flex h-8 items-center gap-1.5 text-xs"
          data-testid="nuevo-socio-btn"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo socio
        </Button>
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
              El alta de un nuevo socio impacta la vinculación de unidades y el reparto de utilidades del sitio. Ingresa tu contraseña de operadora para continuar.
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
                <Button
                  type="submit"
                  disabled={verificando}
                  className="h-8 text-xs"
                  data-testid="confirmar-verif-btn"
                >
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
              <div className="text-sm font-bold text-foreground">Registrar Nuevo Socio</div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCrearSocio} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Nombre o Razón Social</label>
                <Input
                  value={fSocio.nombre}
                  onChange={(e) => setFSocio((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej. Inversiones del Sureste"
                  required
                  className="mt-1 h-8 text-xs"
                  data-testid="socio-nombre"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Usuario para Portal de Dueño</label>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creando}
                  className="h-8 text-xs"
                  data-testid="guardar-socio-btn"
                >
                  {creando ? "Registrando..." : "Guardar Socio"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Listado de socios existentes */}
      <div className="space-y-2">
        {items.map((s) => (
          <div
            key={s.id}
            data-testid={`terminal-socio-${s.id}`}
            onClick={async () => {
              const { data } = await termApi.get(`/terminal/socios/${s.id}`);
              setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, detalle: data } : x)));
            }}
            className="w-full cursor-pointer rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-brand/40"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15">
                  <Building2 className="h-4 w-4 text-brand-bright" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">{s.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">{s.unidades} unidad(es) · @{s.usuario}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            {s.detalle && (
              <div className="mt-2 space-y-1 border-t border-border pt-2">
                {s.detalle.vehiculos.map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono font-bold text-foreground">{v.numero_economico}</span>
                    <span>{v.conductor || "Sin conductor"}</span>
                  </div>
                ))}
                {s.detalle.vehiculos.length === 0 && <div className="text-[11px] text-muted-foreground">Sin unidades vinculadas.</div>}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <EmptyState icon={Building2} title="Sin socios" description="Los socios registrados aparecerán aquí." />}
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

/* ---------------- Dashboard del sitio (F16) ---------------- */
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
        <KPICard icon={FileText} label="Docs del sitio" value="—" />
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
