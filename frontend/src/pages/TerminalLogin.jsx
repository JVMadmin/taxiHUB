import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0D10] px-4 font-sans text-[#F5F5F7]">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[#4F5DFF]/15 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <form
          onSubmit={submit}
          data-testid="terminal-login-form"
          className="w-full rounded-[20px] border border-white/[0.06] bg-[#17191E] p-7 shadow-2xl"
        >
          <div>
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <BrandMark size="lg" />
            <BrandWordmark sub="Centro de operaciones" className="mt-1" />
            <p className="text-sm text-[#9CA0AA]">
              {modo === "login" ? "Acceso de operadora" : "Nueva cuenta de operadora"}
            </p>
          </div>

          <div className="grid gap-4">
            {modo === "registro" && (
              <div className="grid gap-1.5">
                <Label className="text-[#F5F5F7]/90 text-xs font-semibold">Nombre</Label>
                <Input data-testid="term-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7]" />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-[#F5F5F7]/90 text-xs font-semibold">Usuario</Label>
              <Input data-testid="term-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
                placeholder="central" autoCapitalize="none"
                className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7]" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[#F5F5F7]/90 text-xs font-semibold">Contraseña</Label>
              <Input data-testid="term-contrasena" type="password" value={contrasena}
                onChange={(e) => setContrasena(e.target.value)} placeholder="••••••"
                className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7]" />
            </div>
            <Button data-testid="term-submit" type="submit" loading={loading}
              className="mt-2 h-12 text-base font-semibold bg-[#4F5DFF] hover:bg-[#3D49D6] text-white shadow-[0_4px_16px_rgba(79,93,255,0.35)]">
              {modo === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "..." : modo === "login" ? "Entrar" : "Crear cuenta"}
            </Button>
            <button type="button" onClick={() => setModo(modo === "login" ? "registro" : "login")}
              data-testid="term-toggle-modo"
              className="text-center text-xs text-[#9CA0AA] hover:text-[#F5F5F7] transition-colors">
              {modo === "login" ? "Crear una nueva cuenta de operadora" : "Ya tengo cuenta, iniciar sesión"}
            </button>
            <a href="/dev" data-testid="dev-link" className="text-center text-[11px] text-[#9CA0AA]/70 hover:text-[#9CA0AA] transition-colors">Panel de desarrollador</a>
          </div>
          <div className="mt-5 flex justify-center gap-3 text-xs text-[#9CA0AA]">
            <a href="/login" className="hover:text-[#F5F5F7] transition-colors">App del operador</a>
            <span>·</span>
            <a href="/pasajero" className="hover:text-[#F5F5F7] transition-colors">App del pasajero</a>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
}