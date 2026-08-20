import { useEffect, useState } from "react";
import { getMode } from "@/lib/theme";

// Devuelve el modo de apariencia actual ("oscuro" | "claro") y se re-renderiza
// en vivo cuando cambia (botón sol/luna), sin recargar la página.
export function useMode() {
  const [mode, setMode] = useState(getMode());
  useEffect(() => {
    const onMode = () => setMode(getMode());
    window.addEventListener("app:mode", onMode);
    return () => window.removeEventListener("app:mode", onMode);
  }, []);
  return mode;
}