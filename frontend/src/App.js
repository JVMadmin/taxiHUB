import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import Terminal from "@/pages/Terminal";
import OperadorLogin from "@/pages/OperadorLogin";
import OperadorApp from "@/pages/OperadorApp";
import TerminalLogin from "@/pages/TerminalLogin";
import DevPanel from "@/pages/DevPanel";
import PassengerApp from "@/pages/PassengerApp";
import DuenoLogin from "@/pages/DuenoLogin";
import DuenoApp from "@/pages/DuenoApp";
import LandingPage from "@/pages/LandingPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { applyTheme, getTheme, applyMode, getMode } from "@/lib/theme";

function OperadorRootRedirect() {
  const token = typeof window !== "undefined" ? localStorage.getItem("op_token") : null;
  return <Navigate to={token ? "/operador" : "/login"} replace />;
}

function App() {
  const [mode, setMode] = useState(() => getMode());
  const isPublicWebDomain =
    typeof window !== "undefined" &&
    (window.location.hostname === "taxihub.cloud" ||
      window.location.hostname === "www.taxihub.cloud");

  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const queryApp = searchParams ? searchParams.get("app") : null;
  const windowAppMode =
    typeof window !== "undefined" ? window.__TAXIHUB_APP_MODE__ : null;
  const appMode =
    process.env.REACT_APP_APP_MODE || windowAppMode || queryApp || "";

  const isNativeApp =
    typeof window !== "undefined" &&
    (Boolean(window.Capacitor?.isNativePlatform?.()) ||
      Capacitor.isNativePlatform() ||
      window.location.protocol === "capacitor:" ||
      (window.location.protocol === "https:" && window.location.hostname === "localhost") ||
      (window.location.protocol === "http:" &&
        window.location.hostname === "localhost" &&
        window.location.port !== "3000" &&
        window.location.port !== "8080"));

  const isOnlyOperadorApp =
    isNativeApp ||
    appMode === "operador" ||
    process.env.REACT_APP_ONLY_OPERADOR === "true" ||
    process.env.REACT_APP_APP_MODE === "operador" ||
    (typeof window !== "undefined" && window.location.port === "3006");

  const isOnlySocioApp =
    appMode === "socio" ||
    appMode === "dueno" ||
    process.env.REACT_APP_APP_MODE === "socio" ||
    process.env.REACT_APP_APP_MODE === "dueno";

  const isOnlyCentralApp =
    appMode === "central" ||
    process.env.REACT_APP_APP_MODE === "central";

  useEffect(() => {
    applyTheme(getTheme());
    applyMode(getMode());
    const onMode = () => setMode(getMode());
    window.addEventListener("app:mode", onMode);
    return () => window.removeEventListener("app:mode", onMode);
  }, []);

  // Bloqueo de navegación nativa en Android: minimizar app en lugar de salir a webs externas
  useEffect(() => {
    if (!isNativeApp) return;

    let subPromise = null;
    try {
      subPromise = CapApp.addListener("backButton", ({ canGoBack }) => {
        // Disparar evento para permitir a modales, bottom sheets y chats cerrarse primero
        const event = new CustomEvent("app:hardwareBack", { cancelable: true });
        const handled = !window.dispatchEvent(event);
        if (handled) {
          // El modal o drawer consumió el botón Atrás
          return;
        }

        const path = typeof window !== "undefined" ? window.location.pathname : "";
        if (!canGoBack || path === "/login" || path === "/operador" || path === "/" || path === "") {
          CapApp.minimizeApp();
        } else {
          window.history.back();
        }
      });
    } catch (err) {
      console.warn("No se pudo registrar listener de botón atrás nativo:", err);
    }

    return () => {
      if (subPromise && typeof subPromise.then === "function") {
        subPromise.then((h) => h?.remove?.()).catch(() => {});
      } else if (subPromise && typeof subPromise.remove === "function") {
        subPromise.remove();
      }
    };
  }, [isNativeApp]);

  return (
    <div className={mode === "claro" ? "App" : "App dark"}>
      <ErrorBoundary>
        <BrowserRouter>
          {isOnlyOperadorApp ? (
            <Routes>
              <Route path="/login" element={<OperadorLogin />} />
              <Route path="/operador" element={<OperadorApp />} />
              <Route path="/" element={<OperadorRootRedirect />} />
              <Route path="*" element={<OperadorRootRedirect />} />
            </Routes>
          ) : isOnlySocioApp ? (
            <Routes>
              <Route path="/login" element={<DuenoLogin />} />
              <Route path="/dueno/login" element={<DuenoLogin />} />
              <Route path="/dueno" element={<DuenoApp />} />
              <Route path="/" element={<DuenoApp />} />
              <Route path="*" element={<Navigate to="/dueno" replace />} />
            </Routes>
          ) : isOnlyCentralApp ? (
            <Routes>
              <Route path="/login" element={<TerminalLogin isCentralOnly={true} />} />
              <Route path="/terminal/login" element={<TerminalLogin isCentralOnly={true} />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/" element={<Terminal />} />
              <Route path="*" element={<Navigate to="/terminal" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/" element={isPublicWebDomain ? <LandingPage /> : <Terminal />} />
              <Route path="/web" element={<LandingPage />} />
              <Route path="/taxihub" element={<LandingPage />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/terminal/login" element={<TerminalLogin />} />
              <Route path="/login" element={<OperadorLogin />} />
              <Route path="/operador" element={<OperadorApp />} />
              <Route path="/pasajero" element={<PassengerApp />} />
              <Route path="/dueno/login" element={<DuenoLogin />} />
              <Route path="/dueno" element={<DuenoApp />} />
              <Route path="/dev" element={<DevPanel />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster theme={mode === "claro" ? "light" : "dark"} position="top-right" richColors />
    </div>
  );
}

export default App;