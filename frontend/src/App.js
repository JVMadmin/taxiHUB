import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
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

  const isOnlyOperadorApp =
    appMode === "operador" ||
    process.env.REACT_APP_ONLY_OPERADOR === "true" ||
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

  return (
    <div className={mode === "claro" ? "App" : "App dark"}>
      <ErrorBoundary>
        <BrowserRouter>
          {isOnlyOperadorApp ? (
            <Routes>
              <Route path="/login" element={<OperadorLogin />} />
              <Route path="/operador" element={<OperadorApp />} />
              <Route path="/" element={<OperadorApp />} />
              <Route path="*" element={<Navigate to="/operador" replace />} />
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