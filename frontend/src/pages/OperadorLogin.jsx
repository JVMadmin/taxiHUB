import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PassengerApp.css";
import { api, saveAuth, BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Car, LogIn, Settings } from "lucide-react";

const DEMO_OPERADORES = [
  { usuario: "op1", pass: "taxi123", label: "TX-101 · Juan Pérez (Libre)" },
  { usuario: "op2", pass: "taxi123", label: "TX-102 · Miguel López (Libre)" },
  { usuario: "op4", pass: "taxi123", label: "TX-104 · Pedro Gómez (Libre)" },
  { usuario: "op3", pass: "taxi123", label: "TX-103 · Carlos Ruiz (En viaje)" },
];

export default function OperadorLogin() {
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [loading, setLoading] = useState(false);
  const [showServerCfg, setShowServerCfg] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("th_backend_url")) || BACKEND_URL || "https://taxihub.cloud"
  );
  const navigate = useNavigate();

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!usuario || !contrasena) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { usuario, contrasena });
      saveAuth(data.token, data.operador);
      toast.success(`Bienvenido en turno, ${data.operador.nombre}`);
      navigate("/operador");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Credenciales de operador inválidas");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerUrl = () => {
    const clean = (serverUrl || "").trim().replace(/\/+$/, "");
    if (!clean) {
      localStorage.removeItem("th_backend_url");
    } else {
      localStorage.setItem("th_backend_url", clean);
    }
    toast.success("Servidor de central actualizado. Recargando...");
    setTimeout(() => window.location.reload(), 400);
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
              <h1>App exclusiva de Operador</h1>
              <p>Acceso exclusivo para conductores autorizados por la central.</p>
            </div>

            <div className="taxi-passenger-auth-fields">
              <label className="taxi-passenger-field"><span>Usuario de Operador</span>
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
                {loading ? "Entrando a turno..." : "Iniciar sesión de Operador"}
              </Button>
            </div>

            {/* Selector rápido de cuentas de operador para pruebas */}
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#9CA0AA]">
                <span className="font-semibold uppercase tracking-wider">Cuentas rápidas de prueba</span>
                <button
                  type="button"
                  onClick={() => setShowServerCfg((v) => !v)}
                  className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
                >
                  <Settings className="h-3 w-3" /> Servidor API
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_OPERADORES.map((op) => (
                  <button
                    key={op.usuario}
                    type="button"
                    data-testid={`quick-op-${op.usuario}`}
                    onClick={() => {
                      setUsuario(op.usuario);
                      setContrasena(op.pass);
                    }}
                    className="rounded-lg border border-white/10 bg-[#1B1E24] px-2 py-1.5 text-left text-[10px] text-[#F5F5F7] hover:border-emerald-400/50 transition-colors"
                  >
                    <div className="font-bold text-emerald-400">{op.usuario} / {op.pass}</div>
                    <div className="truncate text-[9px] text-[#9CA0AA]">{op.label}</div>
                  </button>
                ))}
              </div>

              {showServerCfg && (
                <div className="mt-2.5 rounded-xl border border-white/10 bg-black/30 p-2.5 text-left">
                  <label className="block text-[10px] font-bold uppercase text-[#9CA0AA]">
                    URL del Servidor Central (para pruebas en APK / Red Local)
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://taxihub.cloud"
                      className="h-8 flex-1 rounded-lg border border-white/10 bg-[#121417] px-2 font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSaveServerUrl}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-zinc-950"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
