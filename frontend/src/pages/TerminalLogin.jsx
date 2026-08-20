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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand/10 blur-[100px]" />
      <div className="relative w-full max-w-sm">
        <form
          onSubmit={submit}
          data-testid="terminal-login-form"
          className="bezel-shell w-full"
        >
          <div className="rounded-[var(--radius)] bg-card/85 p-7">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <BrandMark size="lg" />
            <BrandWordmark sub="Centro de operaciones" className="mt-1" />
            <p className="text-sm text-muted-foreground">
              {modo === "login" ? "Acceso de operadora" : "Nueva cuenta de operadora"}
            </p>
          </div>

          <div className="grid gap-4">
            {modo === "registro" && (
              <div className="grid gap-1.5">
                <Label className="text-foreground/90">Nombre</Label>
                <Input data-testid="term-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="input-inset border-border text-foreground" />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-foreground/90">Usuario</Label>
              <Input data-testid="term-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
                placeholder="central" autoCapitalize="none"
                className="input-inset border-border text-foreground" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-foreground/90">Contraseña</Label>
              <Input data-testid="term-contrasena" type="password" value={contrasena}
                onChange={(e) => setContrasena(e.target.value)} placeholder="••••••"
                className="input-inset border-border text-foreground" />
            </div>
            <Button data-testid="term-submit" type="submit" loading={loading}
              className="mt-2 h-12 text-base">
              {modo === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "..." : modo === "login" ? "Entrar" : "Crear cuenta"}
            </Button>
            <button type="button" onClick={() => setModo(modo === "login" ? "registro" : "login")}
              data-testid="term-toggle-modo"
              className="text-center text-xs text-muted-foreground hover:text-foreground/80">
              {modo === "login" ? "Crear una nueva cuenta de operadora" : "Ya tengo cuenta, iniciar sesión"}
            </button>
            <a href="/dev" data-testid="dev-link" className="text-center text-[11px] text-muted-foreground/70 hover:text-muted-foreground">Panel de desarrollador</a>
          </div>
          <div className="mt-4 flex justify-center gap-3 text-xs text-muted-foreground">
            <a href="/login" className="hover:text-foreground/80">App del operador</a>
            <span>·</span>
            <a href="/pasajero" className="hover:text-foreground/80">App del pasajero</a>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
}