import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, LogIn, UserPlus } from "lucide-react";

export function saveTerminalAuth(token, usuario) {
  localStorage.setItem("term_token", token);
  localStorage.setItem("term_data", JSON.stringify(usuario));
}
export const getTerminalToken = () => localStorage.getItem("term_token");
export const getTerminalUser = () => {
  const d = localStorage.getItem("term_data");
  return d ? JSON.parse(d) : null;
};
export const logoutTerminal = () => {
  localStorage.removeItem("term_token");
  localStorage.removeItem("term_data");
};

export default function TerminalLogin() {
  const [modo, setModo] = useState("login"); // login | registro
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!usuario || !contrasena || (modo === "registro" && !nombre)) return;
    setLoading(true);
    try {
      if (modo === "registro") {
        await api.post("/terminal/usuarios", { nombre, usuario, contrasena });
        toast.success("Cuenta creada, inicia sesión");
        setModo("login");
      } else {
        const { data } = await api.post("/terminal/login", { usuario, contrasena });
        saveTerminalAuth(data.token, data.usuario);
        toast.success(`Bienvenida, ${data.usuario.nombre}`);
        navigate("/");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo continuar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form
        onSubmit={submit}
        data-testid="terminal-login-form"
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7 backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Building2 className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">Terminal</h1>
          <p className="text-sm text-zinc-400">
            {modo === "login" ? "Acceso de operadora" : "Nueva cuenta de operadora"}
          </p>
        </div>

        <div className="grid gap-4">
          {modo === "registro" && (
            <div className="grid gap-1.5">
              <Label className="text-zinc-300">Nombre</Label>
              <Input data-testid="term-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Usuario</Label>
            <Input data-testid="term-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
              placeholder="central" autoCapitalize="none"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Contraseña</Label>
            <Input data-testid="term-contrasena" type="password" value={contrasena}
              onChange={(e) => setContrasena(e.target.value)} placeholder="••••••"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
          </div>
          <Button data-testid="term-submit" type="submit" disabled={loading}
            className="mt-2 h-11 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">
            {modo === "login" ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
            {loading ? "..." : modo === "login" ? "Entrar" : "Crear cuenta"}
          </Button>
          <button type="button" onClick={() => setModo(modo === "login" ? "registro" : "login")}
            data-testid="term-toggle-modo"
            className="text-center text-xs text-zinc-400 hover:text-zinc-200">
            {modo === "login" ? "Crear una nueva cuenta de operadora" : "Ya tengo cuenta, iniciar sesión"}
          </button>
          <a href="/dev" data-testid="dev-link" className="text-center text-[11px] text-zinc-600 hover:text-zinc-400">Panel de desarrollador</a>
        </div>
      </form>
    </div>
  );
}
