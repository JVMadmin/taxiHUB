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
import { applyTheme, getTheme, applyMode, getMode } from "@/lib/theme";

function App() {
  const [mode, setMode] = useState(() => getMode());

  useEffect(() => {
    applyTheme(getTheme());
    applyMode(getMode());
    const onMode = () => setMode(getMode());
    window.addEventListener("app:mode", onMode);
    return () => window.removeEventListener("app:mode", onMode);
  }, []);

  return (
    <div className={mode === "claro" ? "App" : "App dark"}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Terminal />} />
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
      </BrowserRouter>
      <Toaster theme={mode === "claro" ? "light" : "dark"} position="top-right" richColors />
    </div>
  );
}

export default App;