import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PassengerApp.css";
import { api, saveAuth } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
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
    <div className="taxi-passenger-auth">
      <div className="taxi-passenger-auth-orb" />
      <div className="taxi-passenger-auth-card">
        <form
          onSubmit={submit}
          data-testid="operador-login-form"
          className="taxi-passenger-auth-form"
        >
          <div className="taxi-passenger-auth-inner">
            <div className="taxi-passenger-logo taxi-passenger-logo-centered">
              <Car aria-hidden="true" />
              <span>Taxi<span>HUB</span></span>
            </div>
            <div className="taxi-passenger-auth-heading">
              <h1>Panel del conductor</h1>
              <p>Inicia sesión para entrar en operación.</p>
            </div>

            <div className="taxi-passenger-auth-fields">
              <label className="taxi-passenger-field"><span>Usuario</span>
                <Input
                  data-testid="login-usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="op1"
                  autoCapitalize="none"
                />
              </label>
              <label className="taxi-passenger-field"><span>Contraseña</span>
                <Input
                  data-testid="login-contrasena"
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••"
                />
              </label>
              <Button
                data-testid="login-submit"
                type="submit"
                disabled={loading}
                className="taxi-passenger-primary-button"
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Entrando..." : "Iniciar sesión"}
              </Button>
            </div>
          </div>
        </form>
        <div className="taxi-passenger-auth-links">
          <a href="/pasajero">App del pasajero</a>
          <span>·</span>
          <a href="/terminal/login">Terminal</a>
          <span>·</span>
          <a href="/dev">Panel dev</a>
        </div>
      </div>
    </div>
  );
}
