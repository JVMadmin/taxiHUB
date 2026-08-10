import { useState, useEffect, useRef } from "react";
import { Settings, Check } from "lucide-react";
import { THEME_LIST, applyTheme, getTheme } from "@/lib/theme";

export function ThemeSwitcher({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (id) => { applyTheme(id); setTheme(id); setOpen(false); };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        data-testid="theme-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        title="Colores"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800"
      >
        <Settings className="h-5 w-5" />
      </button>
      {open && (
        <div
          data-testid="theme-panel"
          className="absolute right-0 z-[999] mt-2 w-44 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl"
        >
          <div className="px-2 pb-1.5 pt-1 text-xs uppercase tracking-wide text-zinc-500">Paleta de color</div>
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              data-testid={`theme-${t.id}`}
              onClick={() => pick(t.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <span className="h-4 w-4 rounded-full border border-zinc-700" style={{ background: t.swatch }} />
              <span className="flex-1 text-left">{t.label}</span>
              {theme === t.id && <Check className="h-4 w-4 text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
