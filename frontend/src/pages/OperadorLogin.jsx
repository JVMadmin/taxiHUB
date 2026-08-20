import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

export default function OperadorLogin() {
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!usuario || !contrasena) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { usuario, contrasena });
      saveAuth(data.token, data.operador);
      toast.success(`Bienvenido, ${data.operador.nombre}`);
      navigate("/operador");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo iniciar sesión");
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
          data-testid="operador-login-form"
          className="bezel-shell w-full"
        >
          <div className="rounded-[var(--radius)] bg-card/85 p-7">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <BrandMark size="lg" />
              <BrandWordmark sub="App del conductor" className="mt-1" />
              <p className="text-sm text-muted-foreground">Inicia sesión para entrar en operación</p>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-foreground/90">Usuario</Label>
                <Input
                  data-testid="login-usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="op1"
                  autoCapitalize="none"
                  className="input-inset border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-foreground/90">Contraseña</Label>
                <Input
                  data-testid="login-contrasena"
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••"
                  className="input-inset border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Button
                data-testid="login-submit"
                type="submit"
                disabled={loading}
                className="mt-2 h-12 text-base"
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Entrando..." : "Iniciar sesión"}
              </Button>
            </div>
          </div>
        </form>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <a href="/pasajero" className="hover:text-foreground">App del pasajero</a>
          <span>·</span>
          <a href="/terminal/login" className="hover:text-foreground">Terminal</a>
          <span>·</span>
          <a href="/dev" className="hover:text-foreground">Panel dev</a>
        </div>
      </div>
    </div>
  );
}
