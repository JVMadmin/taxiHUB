import { useState, useEffect, useRef, useCallback } from "react";
import { api, BACKEND_URL, ESTADO_LABEL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Terminal as TermIcon, Image, Users, Database, ScrollText, Power } from "lucide-react";

export default function DevPanel() {
  const [authed, setAuthed] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [tab, setTab] = useState("logo");

  const login = async (e) => {
    e.preventDefault();
    try {
      await api.post("/dev/login", { usuario: u, contrasena: p });
      setAuthed(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Credenciales inválidas");
    }
  };

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <form onSubmit={login} data-testid="dev-login-form" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15"><TermIcon className="h-7 w-7 text-emerald-400" /></div>
            <h1 className="text-2xl font-bold text-zinc-50">Panel de desarrollador</h1>
            <p className="text-sm text-zinc-400">Acceso restringido</p>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-1.5"><Label className="text-zinc-300">Usuario</Label>
              <Input data-testid="dev-usuario" value={u} onChange={(e) => setU(e.target.value)} className="border-zinc-700 bg-zinc-800 text-zinc-100" /></div>
            <div className="grid gap-1.5"><Label className="text-zinc-300">Contraseña</Label>
              <Input data-testid="dev-contrasena" type="password" value={p} onChange={(e) => setP(e.target.value)} className="border-zinc-700 bg-zinc-800 text-zinc-100" /></div>
            <Button data-testid="dev-submit" type="submit" className="mt-2 h-11 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">Entrar</Button>
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2 font-bold"><TermIcon className="h-5 w-5 text-emerald-400" /> Panel de desarrollador</div>
        <a href="/" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"><Power className="h-4 w-4" /> Salir</a>
      </header>
      <div className="mx-auto flex max-w-4xl gap-2 p-4">
        <nav className="flex w-44 shrink-0 flex-col gap-1">
          {TABS.map((t) => (
            <button key={t.id} data-testid={`devtab-${t.id}`} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === t.id ? "bg-emerald-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
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
    const { data } = await api.post("/dev/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setLogo(data.foto_url); toast.success("Logotipo actualizado (se refleja en ambas apps)");
  };
  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-400">Reemplaza el logotipo mostrado en la Terminal y la app del operador.</div>
      <div className="flex h-32 w-32 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-800">
        {logo ? <img src={`${BACKEND_URL}${logo}`} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-zinc-500">Sin logo</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <Button data-testid="dev-logo-upload" onClick={() => ref.current?.click()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">Subir logotipo</Button>
    </div>
  );
}

function CuentasTab() {
  const [data, setData] = useState({ operadores: [], usuarios_terminal: [] });
  const load = useCallback(() => api.get("/dev/cuentas").then((r) => setData(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (col, id, activo) => { await api.patch(`/dev/cuentas/${col}/${id}`, { activo }); load(); };
  const Row = ({ c, col }) => (
    <div data-testid={`dev-cuenta-${c.id}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div>
        <div className="text-sm text-zinc-100">{c.nombre} <span className="text-zinc-500">@{c.usuario}</span></div>
        <div className="text-xs text-zinc-500">{col === "operadores" ? (ESTADO_LABEL[c.estado] || "") : "operadora"}{c.activo === false ? " · DESACTIVADA" : ""}</div>
      </div>
      <Button size="sm" onClick={() => toggle(col, c.id, c.activo === false)} className={c.activo === false ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400" : "bg-red-500 text-white hover:bg-red-600"}>
        {c.activo === false ? "Activar" : "Desactivar"}
      </Button>
    </div>
  );
  return (
    <div className="space-y-4">
      <div><div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Operadores</div>
        <div className="space-y-2">{data.operadores.map((c) => <Row key={c.id} c={c} col="operadores" />)}</div></div>
      <div><div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Usuarios Terminal</div>
        <div className="space-y-2">{data.usuarios_terminal.map((c) => <Row key={c.id} c={c} col="usuarios_terminal" />)}</div></div>
    </div>
  );
}

function BackupTab() {
  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-400">Genera y descarga un respaldo completo (JSON) de la base de datos.</div>
      <a data-testid="dev-backup-link" href={`${BACKEND_URL}/api/dev/backup`} className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-4 font-semibold text-zinc-950 hover:bg-emerald-400">
        Descargar respaldo
      </a>
    </div>
  );
}

function AuditoriaTab() {
  const [ev, setEv] = useState([]);
  useEffect(() => { api.get("/dev/auditoria").then((r) => setEv(r.data)); }, []);
  return (
    <div className="space-y-1.5" data-testid="dev-auditoria">
      {ev.length === 0 && <div className="text-sm text-zinc-500">Sin eventos</div>}
      {ev.map((e, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <div><span className="font-medium text-zinc-100">{e.accion}</span> <span className="text-zinc-500">{e.detalle}</span></div>
          <span className="shrink-0 text-xs text-zinc-500">{new Date(e.ts).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
