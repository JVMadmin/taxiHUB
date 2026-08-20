import { useState, useEffect, useRef, useCallback } from "react";
import { api, devApi, BACKEND_URL, ESTADO_LABEL, saveDevAuth, logoutDev } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Terminal as TermIcon, Image, Users, Database, ScrollText, Power } from "lucide-react";

export default function DevPanel() {
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem("dev_token")));
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [tab, setTab] = useState("logo");

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

  const salir = () => { logoutDev(); setAuthed(false); };

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={login} data-testid="dev-login-form" className="bezel-shell w-full max-w-sm">
          <div className="rounded-[var(--radius)] bg-card/85 p-7">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15"><TermIcon className="h-7 w-7 text-brand-bright" /></div>
              <h1 className="text-2xl font-bold text-foreground">Panel de desarrollador</h1>
              <p className="text-sm text-muted-foreground">Acceso restringido</p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1.5"><Label className="text-foreground/90">Usuario</Label>
                <Input data-testid="dev-usuario" value={u} onChange={(e) => setU(e.target.value)} className="input-inset border-border text-foreground" /></div>
              <div className="grid gap-1.5"><Label className="text-foreground/90">Contraseña</Label>
                <Input data-testid="dev-contrasena" type="password" value={p} onChange={(e) => setP(e.target.value)} className="input-inset border-border text-foreground" /></div>
              <Button data-testid="dev-submit" type="submit" className="mt-2 h-11">Entrar</Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const TABS = [
    { id: "logo", label: "Logotipo", icon: Image },
    { id: "cuentas", label: "Cuentas", icon: Users },
    { id: "backup", label: "Respaldo", icon: Database },
    { id: "auditoria", label: "Auditoría", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 font-bold"><TermIcon className="h-5 w-5 text-brand-bright" /> Panel de desarrollador</div>
        <a href="/" onClick={salir} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><Power className="h-4 w-4" /> Salir</a>
      </header>
      <div className="mx-auto flex max-w-4xl gap-2 p-4">
        <nav className="flex w-44 shrink-0 flex-col gap-1">
          {TABS.map((t) => (
            <button key={t.id} data-testid={`devtab-${t.id}`} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === t.id ? "bg-brand text-brand-contrast" : "text-foreground/80 hover:bg-secondary"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-card/60 p-4">
          {tab === "logo" && <LogoTab />}
          {tab === "cuentas" && <CuentasTab />}
          {tab === "backup" && <BackupTab />}
          {tab === "auditoria" && <AuditoriaTab />}
        </div>
      </div>
    </div>
  );
}

function LogoTab() {
  const [logo, setLogo] = useState(null);
  const ref = useRef(null);
  useEffect(() => { api.get("/config/logo").then((r) => setLogo(r.data.foto_url)); }, []);
  const subir = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("foto", file);
    const { data } = await devApi.post("/dev/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setLogo(data.foto_url); toast.success("Logotipo actualizado (se refleja en ambas apps)");
  };
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">Reemplaza el logotipo mostrado en la Terminal y la app del operador.</div>
      <div className="flex h-32 w-32 items-center justify-center rounded-xl border border-border bg-secondary">
        {logo ? <img src={`${BACKEND_URL}${logo}`} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Sin logo</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <Button data-testid="dev-logo-upload" onClick={() => ref.current?.click()}>Subir logotipo</Button>
    </div>
  );
}

function CuentasTab() {
  const [data, setData] = useState({ operadores: [], usuarios_terminal: [] });
  const load = useCallback(() => devApi.get("/dev/cuentas").then((r) => setData(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (col, id, activo) => { await devApi.patch(`/dev/cuentas/${col}/${id}`, { activo }); load(); };
  const Row = ({ c, col }) => (
    <div data-testid={`dev-cuenta-${c.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div>
        <div className="text-sm text-foreground">{c.nombre} <span className="text-muted-foreground">@{c.usuario}</span></div>
        <div className="text-xs text-muted-foreground">{col === "operadores" ? (ESTADO_LABEL[c.estado] || "") : "operadora"}{c.activo === false ? " · DESACTIVADA" : ""}</div>
      </div>
      <Button size="sm" variant={c.activo === false ? "primary" : "destructive"} onClick={() => toggle(col, c.id, c.activo === false)}>
        {c.activo === false ? "Activar" : "Desactivar"}
      </Button>
    </div>
  );
  return (
    <div className="space-y-4">
      <div><div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Operadores</div>
        <div className="space-y-2">{data.operadores.map((c) => <Row key={c.id} c={c} col="operadores" />)}</div></div>
      <div><div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Usuarios Terminal</div>
        <div className="space-y-2">{data.usuarios_terminal.map((c) => <Row key={c.id} c={c} col="usuarios_terminal" />)}</div></div>
    </div>
  );
}

function BackupTab() {
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
    } catch (e) {
      toast.error("No se pudo descargar el respaldo");
    }
  };
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">Genera y descarga un respaldo completo (JSON) de la base de datos.</div>
      <Button data-testid="dev-backup-btn" onClick={descargar}>
        Descargar respaldo
      </Button>
    </div>
  );
}

function AuditoriaTab() {
  const [ev, setEv] = useState([]);
  useEffect(() => { devApi.get("/dev/auditoria").then((r) => setEv(r.data)); }, []);
  return (
    <div className="space-y-1.5" data-testid="dev-auditoria">
      {ev.length === 0 && <div className="text-sm text-muted-foreground">Sin eventos</div>}
      {ev.map((e, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <div><span className="font-medium text-foreground">{e.accion}</span> <span className="text-muted-foreground">{e.detalle}</span></div>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
