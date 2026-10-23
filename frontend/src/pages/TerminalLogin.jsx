import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { toast } from "sonner";
import { LogIn, ShieldCheck } from "lucide-react";

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

export default function TerminalLogin({ isCentralOnly = false }) {
  const isCentralMode =
    isCentralOnly ||
    (typeof window !== "undefined" &&
      (window.__TAXIHUB_APP_MODE__ === "central" ||
        new URLSearchParams(window.location.search).get("app") === "central"));

  // Solo se recuerda el nombre de usuario por seguridad de las usuarias operadoras (NUNCA contraseñas)
  const [usuario, setUsuario] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("th_saved_central_user")) || ""
  );
  const [contrasena, setContrasena] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || !contrasena) return;
    setLoading(true);
    try {
      const { data } = await api.post("/terminal/login", {
        usuario: usuario.trim(),
        contrasena,
      });

      // Guardar el nombre de usuario para mayor agilidad de la operadora, NUNCA la contraseña
      localStorage.setItem("th_saved_central_user", usuario.trim());

      saveTerminalAuth(data.token, data.usuario);
      toast.success(`Bienvenida, ${data.usuario.nombre}`);
      navigate("/terminal");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Usuario o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0D10] px-4 font-sans text-[#F5F5F7]">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[#FFE600]/15 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <form
          onSubmit={submit}
          data-testid="terminal-login-form"
          className="w-full rounded-[24px] border border-white/[0.08] bg-[#17191E] p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <BrandMark size="lg" />
            <BrandWordmark
              sub={isCentralMode ? "Terminal de Central Satelital" : "Centro de Operaciones y Despacho"}
              className="mt-1"
            />
            <p className="text-xs text-[#9CA0AA]">
              {isCentralMode
                ? "Acceso exclusivo para operadoras de Central"
                : "Ingresa tus credenciales de despachadora"}
            </p>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-[#F5F5F7]/90 text-xs font-semibold">Usuario de Central</Label>
              <Input
                data-testid="term-usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="central"
                autoCapitalize="none"
                autoComplete="username"
                className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7] h-11"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[#F5F5F7]/90 text-xs font-semibold">Contraseña</Label>
              <Input
                data-testid="term-contrasena"
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                className="input-inset border-white/[0.08] bg-[#1B1E24] text-[#F5F5F7] h-11"
              />
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#9CA0AA]/80 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Por seguridad, el sistema nunca almacena tu contraseña en este equipo.</span>
            </div>

            <Button
              data-testid="term-submit"
              type="submit"
              loading={loading}
              className="mt-2 h-12 text-base font-semibold bg-[#FFE600] hover:bg-[#FFB800] text-[#0C0E14] shadow-[0_4px_16px_rgba(255, 230, 0,0.35)]"
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Verificando..." : "Entrar a Central"}
            </Button>
          </div>

          <div className="mt-6 text-center text-xs text-[#9CA0AA]">
            <a href="/" data-testid="web-landing-link" className="text-[#10B981] hover:underline transition-colors">
              ← Volver a taxihub.cloud
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}