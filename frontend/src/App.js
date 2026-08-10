import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Terminal from "@/pages/Terminal";
import OperadorLogin from "@/pages/OperadorLogin";
import OperadorApp from "@/pages/OperadorApp";
import TerminalLogin from "@/pages/TerminalLogin";
import { applyTheme, getTheme } from "@/lib/theme";

function App() {
  useEffect(() => { applyTheme(getTheme()); }, []);
  return (
    <div className="App dark">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Terminal />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/terminal/login" element={<TerminalLogin />} />
          <Route path="/login" element={<OperadorLogin />} />
          <Route path="/operador" element={<OperadorApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" richColors />
    </div>
  );
}

export default App;
