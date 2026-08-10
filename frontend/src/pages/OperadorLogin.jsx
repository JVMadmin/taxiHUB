import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Car, LogIn } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form
        onSubmit={submit}
        data-testid="operador-login-form"
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7 backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Car className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">App del Operador</h1>
          <p className="text-sm text-zinc-400">Inicia sesión para entrar en operación</p>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Usuario</Label>
            <Input
              data-testid="login-usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="op1"
              autoCapitalize="none"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-zinc-300">Contraseña</Label>
            <Input
              data-testid="login-contrasena"
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="••••••"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <Button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="mt-2 h-11 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <LogIn className="mr-2 h-4 w-4" />
            {loading ? "Entrando..." : "Iniciar sesión"}
          </Button>
        </div>
      </form>
    </div>
  );
}
