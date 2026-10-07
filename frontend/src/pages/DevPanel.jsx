import { useState, useEffect, useRef, useCallback } from "react";
import { api, devApi, BACKEND_URL, ESTADO_LABEL, saveDevAuth, logoutDev } from "@/lib/api";
import { THEME_LIST, applySitioBranding } from "@/lib/theme";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Terminal as TermIcon,
  Image,
  Users,
  Database,
  ScrollText,
  Power,
  Building2,
  Palette,
  Plus,
  Trash2,
  Check,
  MessageSquare,
  Sparkles,
  BarChart3,
  Receipt,
  Megaphone,
  ShieldCheck,
  HardDrive,
  CalendarClock,
  PhoneCall,
  Send,
  FolderLock,
  Play,
  RefreshCw,
} from "lucide-react";

const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

export default function DevPanel() {
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem("dev_token")));
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [tab, setTab] = useState("analisis");

  const login = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/dev/login", { usuario: u, contrasena: p });
      saveDevAuth(data.token);
      setAuthed(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Credenciales inválidas");
    }
  };

  const salir = () => {
    logoutDev();
    setAuthed(false);
  };

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={login} data-testid="dev-login-form" className="bezel-shell w-full max-w-sm">
          <div className="rounded-[var(--radius)] bg-card/85 p-7">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15">
                <TermIcon className="h-7 w-7 text-brand-bright" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Panel de Desarrollador</h1>
              <p className="text-sm text-muted-foreground">
                Consola exclusiva: Análisis de Tenants, Facturación, Avisos a Terminal, Base de Datos y Configuración
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-foreground/90">Usuario</Label>
                <Input
                  data-testid="dev-usuario"
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                  className="input-inset border-border text-foreground"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-foreground/90">Contraseña</Label>
                <Input
                  data-testid="dev-contrasena"
                  type="password"
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  className="input-inset border-border text-foreground"
                />
              </div>
              <Button data-testid="dev-submit" type="submit" className="mt-2 h-11">
                Entrar al Panel de Desarrollador
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const TABS = [
    { id: "analisis", label: "Análisis de Tenants", icon: BarChart3 },
    { id: "facturas", label: "Facturas por Tenant", icon: Receipt },
    { id: "avisos", label: "Contacto y Avisos", icon: Megaphone },
    { id: "sitios", label: "Configuración Sitios", icon: Building2 },
    { id: "cuentas", label: "Cuentas y Licencias", icon: Users },
    { id: "backup", label: "Base de Datos y WebP", icon: Database },
    { id: "logo", label: "Logotipo Global", icon: Image },
    { id: "auditoria", label: "Auditoría y Desarrollo", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2.5 font-bold">
          <TermIcon className="h-5 w-5 text-brand-bright" />
          <span>Panel de Desarrollador · SaaS Multi-Tenant &amp; Base de Datos</span>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
            Acceso Exclusivo Dev
          </span>
        </div>
        <a
          href="/"
          onClick={salir}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Power className="h-3.5 w-3.5" /> Salir
        </a>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-testid={`devtab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? "bg-brand text-brand-contrast shadow-md"
                  : "text-foreground/80 hover:bg-secondary"
              }`}
            >
              <t.icon className="h-4 w-4 shrink-0" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card/60 p-5">
          {tab === "analisis" && <TenantsAnalisisTab onGoFacturas={() => setTab("facturas")} onGoAvisos={() => setTab("avisos")} />}
          {tab === "facturas" && <FacturasTenantTab />}
          {tab === "avisos" && <AvisosTerminalTab />}
          {tab === "sitios" && <SitiosConfigTab />}
          {tab === "cuentas" && <CuentasTab />}
          {tab === "backup" && <BackupTab />}
          {tab === "logo" && <LogoTab />}
          {tab === "auditoria" && <AuditoriaTab />}
        </div>
      </div>
    </div>
  );
}

function TenantsAnalisisTab({ onGoFacturas, onGoAvisos }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await devApi.get("/dev/tenants-analisis");
      setData(res.data);
    } catch {
      toast.error("No se pudo cargar el análisis de tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renovarRapido = async (clave, dias) => {
    try {
      const { data: sitios } = await devApi.get("/dev/sitios");
      const found = (Array.isArray(sitios) ? sitios : []).find((s) => s.clave === clave);
      if (!found) return;
      await devApi.put(`/dev/sitios/${clave}`, {
        ...found,
        suscripcion_dias: Number(dias),
      });
      toast.success(`Licencia de ${found.nombre} actualizada a ${dias} días restantes`);
      load();
    } catch {
      toast.error("No se pudo actualizar el tiempo de suscripción");
    }
  };

  if (loading && !data) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Analizando métricas de todos los tenants…</div>;
  }

  const totales = data?.totales_globales || {};
  const tenants = data?.tenants || [];

  return (
    <div className="space-y-6" data-testid="dev-tenants-analisis">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Análisis de Tenants, Clientes y Almacenamiento</h2>
          <p className="text-xs text-muted-foreground">
            Monitoreo de cantidad de clientes por tenant, taxis activos, tiempo restante de licencia (Terminal y Socios), facturación y carpeta aislada WebP.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar métricas
        </Button>
      </div>

      {/* KPIs Globales SaaS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Tenants Activos</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-brand-bright">{totales.total_tenants || 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Total Clientes</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-emerald-400">{totales.total_clientes || 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Unidades / Taxis</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-foreground">{totales.total_taxis || 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Socios / Dueños</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-indigo-400">{totales.total_socios || 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Servicios Totales</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-amber-400">{totales.total_servicios || 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Storage WebP</div>
          <div className="mt-1 mono-num text-2xl font-extrabold text-cyan-400">{totales.total_storage_kb || 0} KB</div>
        </div>
      </div>

      {/* Tarjetas detalladas por Tenant */}
      <div className="space-y-4">
        {tenants.map((t) => {
          const sub = t.suscripcion || {};
          const urgente = (sub.dias_restantes ?? 28) <= 5;
          return (
            <div
              key={t.clave}
              data-testid={`tenant-card-${t.clave}`}
              className="rounded-2xl border border-border bg-surface-2 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-foreground">{t.nombre}</span>
                    <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs text-brand-bright">{t.clave}</span>
                    <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                      {t.plan}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    📍 {t.ciudad} · Tel. Central: {t.telefono_central || "No registrado"} · Carpeta aislada:{" "}
                    <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                      {t.storage_carpeta}
                    </code>
                  </div>
                </div>

                {/* Badge de Tiempo Restante de Uso (visible para Terminal y Socios) */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                      urgente
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    <CalendarClock className="h-4 w-4" />
                    <span>Restante (Terminal y Socios): {sub.etiqueta_restante || `${sub.dias_restantes ?? 28}d`}</span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => renovarRapido(t.clave, 30)}>
                    +30 días
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Clientes del Tenant</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-emerald-400" data-testid={`tenant-clientes-${t.clave}`}>
                    {t.clientes_total}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Taxis / Choferes</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-foreground">
                    {t.taxis_activos}/{t.taxis_total}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Socios / Dueños</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-indigo-400">{t.socios_total}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Operadoras</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-foreground">{t.operadoras_total}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Viajes (Hoy / Total)</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-amber-400">
                    {t.servicios_hoy} / {t.servicios_total}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Volumen Operado</div>
                  <div className="mt-0.5 mono-num text-lg font-extrabold text-emerald-400">{fmtMXN(t.ingresos_totales)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">Storage WebP</div>
                  <div className="mt-0.5 mono-num text-sm font-extrabold text-cyan-400">
                    {t.storage_archivos} arch · {t.storage_kb} KB
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="text-muted-foreground">
                  {t.ultima_factura ? (
                    <span>
                      Última factura: <strong className="text-foreground">{t.ultima_factura.folio}</strong> ({fmtMXN(t.ultima_factura.monto)}) · Estado:{" "}
                      <span className={t.ultima_factura.estado === "pagada" ? "font-bold text-emerald-400" : "font-bold text-amber-400"}>
                        {t.ultima_factura.estado.toUpperCase()}
                      </span>
                    </span>
                  ) : (
                    <span>Sin facturas emitidas aún</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onGoFacturas}
                    className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
                  >
                    Ver / Emitir Factura ({t.facturas_pendientes} pend.)
                  </button>
                  <button
                    type="button"
                    onClick={onGoAvisos}
                    className="rounded-lg border border-brand/40 bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand-bright hover:bg-brand/25"
                  >
                    Enviar aviso a esta Terminal
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FacturasTenantTab() {
  const [facturas, setFacturas] = useState([]);
  const [sitios, setSitios] = useState([]);
  const [filtroSitio, setFiltroSitio] = useState("todos");
  const [form, setForm] = useState({
    sitio_id: "sitio_palenque",
    concepto: "Licencia Mensual TaxiHUB Enterprise + Soporte",
    monto: 2500,
    periodo: "Mensual",
    estado: "pendiente",
  });

  const load = useCallback(async () => {
    try {
      const [fRes, sRes] = await Promise.all([
        devApi.get("/dev/facturas"),
        devApi.get("/dev/sitios"),
      ]);
      setFacturas(fRes.data || []);
      setSitios(Array.isArray(sRes.data) ? sRes.data : []);
    } catch {
      toast.error("Error al cargar facturas de tenants");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const emitirFactura = async (e) => {
    e.preventDefault();
    try {
      await devApi.post("/dev/facturas", {
        ...form,
        monto: Number(form.monto) || 2500,
      });
      toast.success("Factura emitida para el tenant");
      load();
    } catch {
      toast.error("No se pudo emitir la factura");
    }
  };

  const cambiarEstado = async (fid, nuevoEstado) => {
    try {
      await devApi.patch(`/dev/facturas/${fid}`, {
        estado: nuevoEstado,
        metodo_pago: "Transferencia SPEI",
      });
      toast.success(
        nuevoEstado === "pagada"
          ? "Factura marcada como PAGADA y licencia renovada por 30 días"
          : "Estado de factura actualizado"
      );
      load();
    } catch {
      toast.error("No se pudo actualizar la factura");
    }
  };

  const visibles = facturas.filter((f) => filtroSitio === "todos" || f.sitio_id === filtroSitio);

  return (
    <div className="space-y-6" data-testid="dev-facturas-panel">
      <div>
        <h2 className="text-lg font-extrabold text-foreground">Facturación por Tenant</h2>
        <p className="text-xs text-muted-foreground">
          Control de facturas de cada sitio/tenant. Al marcar una factura como pagada, el sistema renueva automáticamente 30 días de uso para su Terminal y Socios.
        </p>
      </div>

      {/* Formulario para emitir nueva factura */}
      <form onSubmit={emitirFactura} className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface-2 p-4 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <Label className="text-xs">Tenant / Sitio</Label>
          <select
            value={form.sitio_id}
            onChange={(e) => setForm((f) => ({ ...f, sitio_id: e.target.value }))}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
          >
            {sitios.map((s) => (
              <option key={s.clave} value={s.clave}>
                {s.nombre} ({s.clave})
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <Label className="text-xs">Concepto de Factura</Label>
          <Input
            value={form.concepto}
            onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
            className="input-inset mt-1 h-9 text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Monto ($ MXN)</Label>
          <Input
            type="number"
            value={form.monto}
            onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
            className="input-inset mono-num mt-1 h-9 text-xs"
          />
        </div>
        <div className="sm:col-span-3 flex items-end">
          <Button type="submit" data-testid="dev-emitir-factura-btn" className="h-9 w-full text-xs">
            <Plus className="h-3.5 w-3.5" /> Emitir Factura
          </Button>
        </div>
      </form>

      {/* Filtro por tenant */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Filtrar por tenant:</span>
        <button
          type="button"
          onClick={() => setFiltroSitio("todos")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
            filtroSitio === "todos" ? "bg-brand text-brand-contrast" : "bg-secondary text-muted-foreground"
          }`}
        >
          Todos ({facturas.length})
        </button>
        {sitios.map((s) => (
          <button
            key={s.clave}
            type="button"
            onClick={() => setFiltroSitio(s.clave)}
            className={`rounded-lg px-2.5 py-1 font-mono text-xs font-semibold ${
              filtroSitio === s.clave ? "bg-brand text-brand-contrast" : "bg-secondary text-muted-foreground"
            }`}
          >
            {s.clave}
          </button>
        ))}
      </div>

      {/* Lista de facturas */}
      <div className="space-y-2.5">
        {visibles.map((f) => (
          <div
            key={f.id}
            data-testid={`dev-factura-${f.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-extrabold text-brand-bright">{f.folio}</span>
                <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-foreground">{f.sitio_id}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                    f.estado === "pagada"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {f.estado}
                </span>
              </div>
              <div className="text-sm font-bold text-foreground">{f.concepto}</div>
              <div className="text-xs text-muted-foreground">
                Periodo: {f.periodo} · Vence: {f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString("es-MX") : "—"} · Método:{" "}
                {f.metodo_pago || "SPEI"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="mono-num text-lg font-extrabold text-emerald-400">{fmtMXN(f.monto)}</div>
                <div className="text-[10px] text-muted-foreground">{f.moneda || "MXN"}</div>
              </div>
              {f.estado !== "pagada" ? (
                <Button size="sm" onClick={() => cambiarEstado(f.id, "pagada")}>
                  <Check className="h-3.5 w-3.5" /> Marcar Pagada (+30d)
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => cambiarEstado(f.id, "pendiente")}>
                  Reabrir
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvisosTerminalTab() {
  const [avisos, setAvisos] = useState([]);
  const [sitios, setSitios] = useState([]);
  const [form, setForm] = useState({
    sitio_id: "todos",
    titulo: "Aviso de Soporte Técnico",
    mensaje: "",
    nivel: "info",
    destino: "terminal_y_socios",
    horas_vigencia: 24,
  });

  const load = useCallback(async () => {
    try {
      const [aRes, sRes] = await Promise.all([
        devApi.get("/dev/avisos"),
        devApi.get("/dev/sitios"),
      ]);
      setAvisos(aRes.data || []);
      setSitios(Array.isArray(sRes.data) ? sRes.data : []);
    } catch {
      toast.error("No se pudieron cargar los avisos");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enviarAviso = async (e) => {
    e.preventDefault();
    if (!form.mensaje.trim()) {
      toast.error("Escribe el mensaje del aviso para la Terminal");
      return;
    }
    try {
      await devApi.post("/dev/avisos", {
        ...form,
        horas_vigencia: Number(form.horas_vigencia) || 24,
      });
      toast.success("Aviso enviado en tiempo real a la Terminal y Socios");
      setForm((f) => ({ ...f, mensaje: "" }));
      load();
    } catch {
      toast.error("No se pudo enviar el aviso");
    }
  };

  const desactivar = async (aid) => {
    try {
      await devApi.delete(`/dev/avisos/${aid}`);
      toast.info("Aviso retirado de las terminales");
      load();
    } catch {
      toast.error("No se pudo desactivar el aviso");
    }
  };

  return (
    <div className="space-y-6" data-testid="dev-avisos-panel">
      <div>
        <h2 className="text-lg font-extrabold text-foreground">Herramientas de Contacto y Avisos a la Terminal</h2>
        <p className="text-xs text-muted-foreground">
          Envía comunicados en vivo (mantenimiento, corte de facturación, actualizaciones o soporte) directamente al cintillo superior de la Terminal y el Panel de Socios.
        </p>
      </div>

      {/* Formulario de envío de aviso en tiempo real */}
      <form onSubmit={enviarAviso} className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Tenant Destino</Label>
            <select
              value={form.sitio_id}
              onChange={(e) => setForm((f) => ({ ...f, sitio_id: e.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
            >
              <option value="todos">Todos los Tenants</option>
              {sitios.map((s) => (
                <option key={s.clave} value={s.clave}>
                  {s.nombre} ({s.clave})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Título del Aviso</Label>
            <Input
              data-testid="dev-aviso-titulo"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="input-inset mt-1 h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Prioridad / Nivel</Label>
            <select
              value={form.nivel}
              onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
            >
              <option value="info">Informativo (Azul)</option>
              <option value="alerta">Alerta / Facturación (Ámbar)</option>
              <option value="urgente">Urgente / Crítico (Rojo)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Vigencia (Horas)</Label>
            <Input
              type="number"
              value={form.horas_vigencia}
              onChange={(e) => setForm((f) => ({ ...f, horas_vigencia: e.target.value }))}
              className="input-inset mono-num mt-1 h-9 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            data-testid="dev-aviso-mensaje"
            value={form.mensaje}
            onChange={(e) => setForm((f) => ({ ...f, mensaje: e.target.value }))}
            placeholder="Ej. Recordatorio: Su factura mensual vence en 3 días. Soporte WhatsApp: +52 916 100 0000"
            className="input-inset flex-1 text-xs"
          />
          <Button type="submit" data-testid="dev-aviso-enviar-btn">
            <Send className="h-4 w-4" /> Transmitir Aviso a Terminal
          </Button>
        </div>
      </form>

      {/* Directorio rápido de contacto con las centrales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sitios.map((s) => (
          <div key={s.clave} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
            <div>
              <div className="text-sm font-bold text-foreground">{s.nombre}</div>
              <div className="text-xs text-muted-foreground">
                Tel. Central: {s.telefono_central || "Sin teléfono"} · Soporte Dev: {s.contacto_soporte || "+52 916 100 0000"}
              </div>
            </div>
            {s.telefono_central && (
              <a
                href={`https://wa.me/${s.telefono_central.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                <PhoneCall className="h-3.5 w-3.5" /> Contactar Central
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Historial de avisos emitidos */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avisos emitidos recientemente</div>
        {avisos.length === 0 && <div className="text-xs text-muted-foreground">No hay avisos registrados.</div>}
        {avisos.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{a.titulo}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-brand-bright">{a.sitio_id}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{a.nivel}</span>
                {a.activo === false && <span className="text-rose-400 font-bold">· INACTIVO</span>}
              </div>
              <div className="mt-0.5 text-muted-foreground">{a.mensaje}</div>
            </div>
            {a.activo !== false && (
              <Button size="sm" variant="destructive" onClick={() => desactivar(a.id)}>
                Retirar aviso
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoTab() {
  const [logo, setLogo] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    api.get("/config/logo").then((r) => setLogo(r.data.foto_url));
  }, []);
  const subir = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("foto", file);
    const { data } = await devApi.post("/dev/logo", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setLogo(data.foto_url);
    toast.success("Logotipo actualizado y comprimido a WebP seguro");
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground">Logotipo global / sitio principal</h2>
        <div className="text-sm text-muted-foreground">
          Reemplaza el logotipo mostrado en la Terminal, el Panel del Socio y la app del operador.
        </div>
      </div>
      <div className="flex h-32 w-32 items-center justify-center rounded-xl border border-border bg-secondary p-2">
        {logo ? (
          <img src={`${BACKEND_URL}${logo}`} alt="logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Sin logo</span>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => subir(e.target.files?.[0])}
      />
      <Button data-testid="dev-logo-upload" onClick={() => ref.current?.click()}>
        Subir logotipo
      </Button>
    </div>
  );
}

function SitiosConfigTab() {
  const [sitios, setSitios] = useState([]);
  const [selectedClave, setSelectedClave] = useState("sitio_palenque");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoSitio, setNuevoSitio] = useState({
    clave: "",
    nombre: "",
    ciudad: "Palenque, Chiapas",
    admin_usuario: "",
    admin_contrasena: "",
    suscripcion_dias: 30,
  });
  const logoSitioRef = useRef(null);

  const loadSitios = useCallback(async () => {
    try {
      const { data } = await devApi.get("/dev/sitios");
      const list = Array.isArray(data) ? data : data.sitios || [];
      setSitios(list);
      const current = list.find((s) => s.clave === selectedClave) || list[0];
      if (current) {
        setSelectedClave(current.clave);
        setForm({
          ...current,
          tema: current.tema || current.tema_default || "esmeralda",
          color_primario: current.color_primario || "#10b981",
          puntos_calientes: current.puntos_calientes || [],
          suscripcion_dias: current.suscripcion?.dias_restantes ?? 30,
        });
      }
    } catch {
      toast.error("No se pudieron cargar los sitios");
    }
  }, [selectedClave]);

  useEffect(() => {
    loadSitios();
  }, [loadSitios]);

  const handleSelectSitio = (clave) => {
    setSelectedClave(clave);
    const found = sitios.find((s) => s.clave === clave);
    if (found) {
      setForm({
        ...found,
        tema: found.tema || found.tema_default || "esmeralda",
        color_primario: found.color_primario || "#10b981",
        puntos_calientes: found.puntos_calientes || [],
        suscripcion_dias: found.suscripcion?.dias_restantes ?? 30,
      });
    }
  };

  const subirLogoPorSitio = async (file) => {
    if (!file || !form) return;
    try {
      const fd = new FormData();
      fd.append("foto", file);
      const { data } = await devApi.post(`/dev/sitios/${form.clave}/logo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, logo_url: data.foto_url }));
      toast.success(`Logotipo de ${form.nombre} actualizado y comprimido en carpeta aislada`);
      loadSitios();
    } catch {
      toast.error("No se pudo subir el logotipo del sitio");
    }
  };

  const guardarSitio = async (e) => {
    if (e) e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        clave: form.clave,
        nombre: form.nombre,
        subtitulo: form.subtitulo || "Central de Despacho Satelital",
        ciudad: form.ciudad || "Palenque, Chiapas",
        telefono_central: form.telefono_central || "",
        logo_url: form.logo_url || null,
        tema: form.tema || "esmeralda",
        tema_default: form.tema || "esmeralda",
        color_primario: form.color_primario || "#10b981",
        map_center_lat: Number(form.map_center_lat) || 17.5099,
        map_center_lng: Number(form.map_center_lng) || -91.9847,
        cuota_diaria_default: Number(form.cuota_diaria_default) || 350,
        auto_respuesta_wa: Boolean(form.auto_respuesta_wa),
        plantilla_wa: form.plantilla_wa || null,
        suscripcion_dias: Number(form.suscripcion_dias) || 30,
        plan_nombre: form.plan_nombre || "Enterprise Multi-Sitio",
        contacto_soporte: form.contacto_soporte || "+52 916 100 0000",
        puntos_calientes: (form.puntos_calientes || []).map((p, idx) => ({
          id: p.id || `poi_${idx + 1}`,
          nombre: p.nombre || "Punto",
          referencia: p.referencia || "",
          lat: Number(p.lat) || 17.5099,
          lng: Number(p.lng) || -91.9847,
          tarifa_sugerida: Number(p.tarifa_sugerida) || 50,
          icono: p.icono || "map-pin",
        })),
      };
      const { data } = await devApi.put(`/dev/sitios/${form.clave}`, payload);
      applySitioBranding(data);
      toast.success(`Sitio "${form.nombre}" guardado y aplicado`);
      loadSitios();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al guardar configuración del sitio");
    } finally {
      setSaving(false);
    }
  };

  const crearNuevoTenant = async (e) => {
    e.preventDefault();
    if (!nuevoSitio.clave || !nuevoSitio.nombre) {
      toast.error("Clave y nombre del sitio son obligatorios");
      return;
    }
    try {
      await devApi.post("/dev/sitios", nuevoSitio);
      toast.success(`Nuevo tenant "${nuevoSitio.nombre}" creado con su carpeta aislada de storage`);
      setNuevoOpen(false);
      setSelectedClave(nuevoSitio.clave);
      setNuevoSitio({ clave: "", nombre: "", ciudad: "Palenque, Chiapas", admin_usuario: "", admin_contrasena: "", suscripcion_dias: 30 });
      loadSitios();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo crear el sitio");
    }
  };

  const addPoi = () => {
    setForm((f) => ({
      ...f,
      puntos_calientes: [
        ...(f.puntos_calientes || []),
        {
          id: `poi_${Date.now()}`,
          nombre: "Nueva Base / Sitio",
          referencia: "Referencia rápida",
          lat: Number(f.map_center_lat) || 17.5099,
          lng: Number(f.map_center_lng) || -91.9847,
          tarifa_sugerida: 50,
          icono: "map-pin",
        },
      ],
    }));
  };

  const updatePoi = (idx, field, val) => {
    setForm((f) => ({
      ...f,
      puntos_calientes: f.puntos_calientes.map((item, i) => (i === idx ? { ...item, [field]: val } : item)),
    }));
  };

  const removePoi = (idx) => {
    setForm((f) => ({
      ...f,
      puntos_calientes: f.puntos_calientes.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-6" data-testid="dev-sitios-panel">
      {/* Selector de Tenant + Botón Nuevo Tenant */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Configuración Multi-Sitio (Tenants)</h2>
          <p className="text-xs text-muted-foreground">
            Cada sitio opera en su propio tenant aislado (carpeta local WebP, logotipo, colores, días de licencia y puntos calientes).
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          data-testid="dev-nuevo-sitio-btn"
          onClick={() => setNuevoOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" /> Nuevo sitio (Tenant)
        </Button>
      </div>

      {/* Selector de sitios existentes */}
      <div className="flex flex-wrap gap-2">
        {sitios.map((s) => (
          <button
            key={s.clave}
            type="button"
            data-testid={`dev-sitio-select-${s.clave}`}
            onClick={() => handleSelectSitio(s.clave)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
              selectedClave === s.clave
                ? "border-brand bg-brand/15 text-brand-bright shadow-sm"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color_primario || "#10b981" }}
            />
            <span>{s.nombre}</span>
            <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {s.clave}
            </span>
          </button>
        ))}
      </div>

      {/* Modal/Formulario para dar de alta un nuevo tenant */}
      {nuevoOpen && (
        <form
          onSubmit={crearNuevoTenant}
          className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4"
          data-testid="dev-nuevo-sitio-form"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-brand-bright">
            Registrar nuevo sitio aislado
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Clave única (ej. sitio_centro)</Label>
              <Input
                data-testid="dev-nuevo-sitio-clave"
                value={nuevoSitio.clave}
                onChange={(e) => setNuevoSitio((s) => ({ ...s, clave: e.target.value }))}
                placeholder="sitio_centro"
                className="input-inset mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Nombre comercial del sitio</Label>
              <Input
                data-testid="dev-nuevo-sitio-nombre"
                value={nuevoSitio.nombre}
                onChange={(e) => setNuevoSitio((s) => ({ ...s, nombre: e.target.value }))}
                placeholder="Radio Taxis Centro"
                className="input-inset mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Ciudad / Zona</Label>
              <Input
                value={nuevoSitio.ciudad}
                onChange={(e) => setNuevoSitio((s) => ({ ...s, ciudad: e.target.value }))}
                placeholder="Palenque, Chiapas"
                className="input-inset mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Usuario Operadora inicial</Label>
              <Input
                value={nuevoSitio.admin_usuario}
                onChange={(e) => setNuevoSitio((s) => ({ ...s, admin_usuario: e.target.value }))}
                placeholder="central_centro"
                className="input-inset mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Contraseña inicial</Label>
              <Input
                type="password"
                value={nuevoSitio.admin_contrasena}
                onChange={(e) => setNuevoSitio((s) => ({ ...s, admin_contrasena: e.target.value }))}
                placeholder="••••••••"
                className="input-inset mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" data-testid="dev-nuevo-sitio-guardar" className="w-full">
                Crear Tenant
              </Button>
            </div>
          </div>
        </form>
      )}

      {form && (
        <form onSubmit={guardarSitio} className="space-y-6">
          {/* 1. Identidad, Licencia y Logotipo por Sitio */}
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface-2 p-4 md:grid-cols-3">
            <div className="flex flex-col items-center justify-center gap-2 border-b border-border pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-2">
                {form.logo_url ? (
                  <img
                    src={`${BACKEND_URL}${form.logo_url}`}
                    alt="Logo sitio"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-muted-foreground">Sin logo propio</span>
                )}
              </div>
              <input
                ref={logoSitioRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => subirLogoPorSitio(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="dev-sitio-logo-btn"
                onClick={() => logoSitioRef.current?.click()}
              >
                <Image className="h-3.5 w-3.5" /> Cambiar logo del sitio
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
              <div>
                <Label className="text-xs">Nombre del Sitio</Label>
                <Input
                  data-testid="dev-sitio-nombre"
                  value={form.nombre || ""}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="input-inset mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Subtítulo / Eslogan</Label>
                <Input
                  data-testid="dev-sitio-subtitulo"
                  value={form.subtitulo || ""}
                  onChange={(e) => setForm((f) => ({ ...f, subtitulo: e.target.value }))}
                  className="input-inset mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Ciudad</Label>
                <Input
                  value={form.ciudad || ""}
                  onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))}
                  className="input-inset mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Días Restantes de Uso (Terminal y Socios)</Label>
                <Input
                  type="number"
                  data-testid="dev-sitio-suscripcion-dias"
                  value={form.suscripcion_dias ?? 30}
                  onChange={(e) => setForm((f) => ({ ...f, suscripcion_dias: e.target.value }))}
                  className="input-inset mono-num mt-1"
                />
              </div>
            </div>
          </div>

          {/* 2. Paleta de Colores, Centro de Mapa y Cuota Base */}
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label className="mb-1.5 flex items-center gap-1.5 text-xs">
                <Palette className="h-3.5 w-3.5 text-brand-bright" /> Tema predeterminado del Sitio
              </Label>
              <div className="flex flex-wrap gap-2">
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`dev-sitio-tema-${t.id}`}
                    onClick={() => setForm((f) => ({ ...f, tema: t.id, color_primario: t.swatch }))}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.tema === t.id
                        ? "border-brand bg-brand/15 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Color Primario (HEX)</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_primario || "#10b981"}
                  onChange={(e) => setForm((f) => ({ ...f, color_primario: e.target.value }))}
                  className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-card p-0.5"
                />
                <Input
                  data-testid="dev-sitio-color"
                  value={form.color_primario || "#10b981"}
                  onChange={(e) => setForm((f) => ({ ...f, color_primario: e.target.value }))}
                  className="input-inset mono-num"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Cuota Diaria Base ($ MXN)</Label>
              <Input
                type="number"
                data-testid="dev-sitio-cuota"
                value={form.cuota_diaria_default ?? 350}
                onChange={(e) => setForm((f) => ({ ...f, cuota_diaria_default: e.target.value }))}
                className="input-inset mono-num mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Latitud Centro Mapa</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.map_center_lat ?? 17.5099}
                onChange={(e) => setForm((f) => ({ ...f, map_center_lat: e.target.value }))}
                className="input-inset mono-num mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Longitud Centro Mapa</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.map_center_lng ?? -91.9847}
                onChange={(e) => setForm((f) => ({ ...f, map_center_lng: e.target.value }))}
                className="input-inset mono-num mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> Auto-Respuesta WhatsApp Anti-Ban
              </Label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="wa-auto-toggle"
                  checked={Boolean(form.auto_respuesta_wa)}
                  onChange={(e) => setForm((f) => ({ ...f, auto_respuesta_wa: e.target.checked }))}
                  className="h-4 w-4 accent-emerald-500"
                />
                <label htmlFor="wa-auto-toggle" className="text-xs text-muted-foreground">
                  Enviar automáticamente datos de unidad, placa, chofer y ETA al despachar desde WhatsApp
                </label>
              </div>
            </div>
          </div>

          {/* 3. Botonera de Puntos Calientes (POIs) para despacho en 1 clic */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-amber-400" /> Botonera de Puntos Calientes (Solo Nombre en Barra)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Aparecen en la barra superior del mapa de la Operadora mostrando únicamente el nombre del lugar.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" data-testid="dev-poi-add" onClick={addPoi}>
                <Plus className="h-3.5 w-3.5" /> Agregar Punto
              </Button>
            </div>

            <div className="space-y-2">
              {(form.puntos_calientes || []).map((poi, idx) => (
                <div
                  key={poi.id || idx}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-2.5 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <Input
                      value={poi.nombre}
                      onChange={(e) => updatePoi(idx, "nombre", e.target.value)}
                      placeholder="Nombre (ej. Terminal ADO)"
                      className="input-inset h-8 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      value={poi.referencia || ""}
                      onChange={(e) => updatePoi(idx, "referencia", e.target.value)}
                      placeholder="Referencia / Calle"
                      className="input-inset h-8 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      step="0.0001"
                      value={poi.lat}
                      onChange={(e) => updatePoi(idx, "lat", e.target.value)}
                      placeholder="Lat"
                      className="input-inset mono-num h-8 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      step="0.0001"
                      value={poi.lng}
                      onChange={(e) => updatePoi(idx, "lng", e.target.value)}
                      placeholder="Lng"
                      className="input-inset mono-num h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removePoi(idx)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      title="Eliminar punto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" data-testid="dev-sitio-guardar" disabled={saving}>
              <Check className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar configuración del sitio"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function CuentasTab() {
  const [data, setData] = useState({ operadores: [], usuarios_terminal: [], usuarios_dueno: [] });
  const [sitiosMap, setSitiosMap] = useState({});
  const [filtroSitio, setFiltroSitio] = useState("todos");

  const load = useCallback(async () => {
    const [cuentasRes, sitiosRes] = await Promise.all([
      devApi.get("/dev/cuentas"),
      devApi.get("/dev/sitios").catch(() => ({ data: [] })),
    ]);
    setData({
      operadores: cuentasRes.data.operadores || [],
      usuarios_terminal: cuentasRes.data.usuarios_terminal || [],
      usuarios_dueno: cuentasRes.data.usuarios_dueno || [],
    });
    const sm = {};
    (Array.isArray(sitiosRes.data) ? sitiosRes.data : []).forEach((s) => {
      sm[s.clave] = s;
    });
    setSitiosMap(sm);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (col, id, activo) => {
    await devApi.patch(`/dev/cuentas/${col}/${id}`, { activo });
    load();
  };

  const filtra = (lista) =>
    (lista || []).filter((c) => filtroSitio === "todos" || (c.sitio_id || "sitio_palenque") === filtroSitio);

  const Row = ({ c, col }) => {
    const sitioClave = c.sitio_id || "sitio_palenque";
    const sub = sitiosMap[sitioClave]?.suscripcion;
    const muestraTiempoUso = col === "usuarios_terminal" || col === "usuarios_dueno";
    return (
      <div
        data-testid={`dev-cuenta-${c.id}`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span className="font-semibold">{c.nombre}</span>
            <span className="text-muted-foreground">@{c.usuario}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-brand-bright">
              {sitioClave}
            </span>
            {muestraTiempoUso && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                <CalendarClock className="h-3 w-3" />
                Restante: {sub?.etiqueta_restante || "28d 12h"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {col === "operadores"
              ? `${c.placa ? `${c.placa} · ` : ""}${ESTADO_LABEL[c.estado] || ""} (Sin indicador de licencia — solo chofer)`
              : col === "usuarios_dueno"
              ? "Socio / Dueño de flota (Visualiza tiempo restante de uso)"
              : "Operadora Terminal (Visualiza tiempo restante de uso)"}
            {c.activo === false ? " · DESACTIVADA" : ""}
          </div>
        </div>
        <Button
          size="sm"
          variant={c.activo === false ? "primary" : "destructive"}
          onClick={() => toggle(col, c.id, c.activo === false)}
        >
          {c.activo === false ? "Activar" : "Desactivar"}
        </Button>
      </div>
    );
  };

  const sitiosUnicos = Array.from(
    new Set(
      [...data.operadores, ...data.usuarios_terminal, ...(data.usuarios_dueno || [])].map(
        (x) => x.sitio_id || "sitio_palenque"
      )
    )
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Filtrar por tenant:</span>
        <button
          type="button"
          onClick={() => setFiltroSitio("todos")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
            filtroSitio === "todos" ? "bg-brand text-brand-contrast" : "bg-secondary text-muted-foreground"
          }`}
        >
          Todos ({data.operadores.length + data.usuarios_terminal.length + (data.usuarios_dueno?.length || 0)})
        </button>
        {sitiosUnicos.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFiltroSitio(s)}
            className={`rounded-lg px-2.5 py-1 font-mono text-xs font-semibold ${
              filtroSitio === s ? "bg-brand text-brand-contrast" : "bg-secondary text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-400">
          Usuarios Terminal — Tiempo restante visible ({filtra(data.usuarios_terminal).length})
        </div>
        <div className="space-y-2">
          {filtra(data.usuarios_terminal).map((c) => (
            <Row key={c.id} c={c} col="usuarios_terminal" />
          ))}
        </div>
      </div>

      {data.usuarios_dueno?.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-400">
            Socios / Dueños de Flota — Tiempo restante visible ({filtra(data.usuarios_dueno).length})
          </div>
          <div className="space-y-2">
            {filtra(data.usuarios_dueno).map((c) => (
              <Row key={c.id} c={c} col="usuarios_dueno" />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Operadores / Choferes ({filtra(data.operadores).length})
        </div>
        <div className="space-y-2">
          {filtra(data.operadores).map((c) => (
            <Row key={c.id} c={c} col="operadores" />
          ))}
        </div>
      </div>
    </div>
  );
}

function BackupTab() {
  const [optResult, setOptResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [simLoading, setSimLoading] = useState(false);

  const descargar = async () => {
    try {
      const { data: blob } = await devApi.get("/dev/backup", { responseType: "blob" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "backup_central_taxis.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Respaldo descargado");
    } catch {
      toast.error("No se pudo descargar el respaldo");
    }
  };

  const ejecutarOptimizadorWebP = async () => {
    setOptimizing(true);
    try {
      const { data } = await devApi.post("/dev/storage/optimizar");
      setOptResult(data);
      toast.success(`Compresión WebP y aislamiento por tenant completado (${data.optimizados_webp} optimizados)`);
    } catch {
      toast.error("Error al optimizar imágenes a WebP");
    } finally {
      setOptimizing(false);
    }
  };

  const sembrarSimulacion = async () => {
    setSimLoading(true);
    try {
      await api.post("/simulacion/sembrar");
      await api.post("/simulacion/iniciar");
      toast.success("Base de datos demo sembrada y simulador GPS iniciado");
    } catch {
      toast.error("No se pudo iniciar la simulación");
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="dev-backup-panel">
      {/* 1. Seguridad de Imágenes, Aislamiento por Tenant y Compresor WebP */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">
              Escáner Antimalware + Compresor Automático WebP + Carpetas Aisladas por Tenant
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Todas las imágenes subidas (objetos reportados, fotos de choferes/socios y logotipos) pasan por verificación de firmas binarias (magic-bytes), detección de payloads maliciosos (`&lt;script&gt;`, PHP, ejecutables PE/ELF), eliminación de metadatos EXIF y conversión automática a <strong>WebP comprimido</strong> dentro de <code>uploads/&lt;tenant_id&gt;/&lt;categoria&gt;/</code>.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            data-testid="dev-webp-optimize-btn"
            onClick={ejecutarOptimizadorWebP}
            disabled={optimizing}
          >
            <FolderLock className="h-4 w-4" />
            {optimizing ? "Analizando y comprimiendo a WebP…" : "Auditar, Aislar por Tenant y Comprimir a WebP"}
          </Button>
          {optResult && (
            <span className="mono-num text-xs font-semibold text-emerald-300">
              ✓ {optResult.optimizados_webp} convertidos a WebP · {optResult.migrados_tenant} aislados por carpeta · {optResult.kb_ahorrados} KB ahorrados
            </span>
          )}
        </div>
      </div>

      {/* 2. Respaldo JSON de Base de Datos */}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <HardDrive className="h-4 w-4 text-brand-bright" /> Respaldo Completo de Base de Datos (JSON)
        </div>
        <div className="text-xs text-muted-foreground">
          Exporta todas las colecciones multi-tenant (`operadores`, `clientes`, `rutas`, `colonias_custom`, `servicios`, `reportes_objetos`, `tarifas_predefinidas`, `facturas_tenants`, `avisos_sistema`).
        </div>
        <Button data-testid="dev-backup-btn" variant="secondary" onClick={descargar}>
          Descargar respaldo JSON
        </Button>
      </div>

      {/* 3. Herramienta de Desarrollo / Simulador GPS */}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Play className="h-4 w-4 text-amber-400" /> Simulador de Flota y Semilla de Datos (Entorno Dev)
        </div>
        <div className="text-xs text-muted-foreground">
          Siembra unidades, socios, servicios del día y activa el movimiento GPS en tiempo real en Palenque.
        </div>
        <Button variant="secondary" onClick={sembrarSimulacion} disabled={simLoading}>
          {simLoading ? "Iniciando…" : "Sembrar Datos Demo + Activar Movimiento GPS"}
        </Button>
      </div>
    </div>
  );
}

function AuditoriaTab() {
  const [ev, setEv] = useState([]);
  useEffect(() => {
    devApi.get("/dev/auditoria").then((r) => setEv(r.data));
  }, []);
  return (
    <div className="space-y-1.5" data-testid="dev-auditoria">
      {ev.length === 0 && <div className="text-sm text-muted-foreground">Sin eventos</div>}
      {ev.map((e, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <div>
            <span className="font-medium text-foreground">{e.accion}</span>{" "}
            <span className="text-muted-foreground">{e.detalle}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(e.ts).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
