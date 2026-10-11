import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { BrandLockup } from "@/components/Brand";
import { LANDING } from "@/constants/testIds";
import { scrollToId } from "./motion";

export const SECTIONS = [
  { id: "producto", label: "Producto" },
  { id: "funciones", label: "Funciones" },
  { id: "apps", label: "Apps" },
  { id: "precio", label: "Precio" },
  { id: "contacto", label: "Contacto" },
];

export function LandingNav() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  const go = (e, id) => {
    e.preventDefault();
    setOpen(false);
    scrollToId(id, reduce);
  };

  return (
    <header
      data-testid={LANDING.nav}
      className="sticky top-4 z-40 px-4 sm:px-6"
      role="banner"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-slate-200/90 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur-xl">
        <a
          href="#inicio"
          onClick={(e) => go(e, "inicio")}
          className="flex items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="TaxiHUB inicio"
        >
          <BrandLockup markSize="sm" />
          <span className="hidden font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700 sm:inline-block bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            taxihub.cloud
          </span>
        </a>

        {/* Enlaces de escritorio */}
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex" aria-label="Navegación principal">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => go(e, s.id)}
              className="transition-colors hover:text-slate-900"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Acciones principales */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={LANDING.goOperador}
            onClick={() => navigate("/login")}
            className="hidden min-h-[40px] items-center rounded-full px-3.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
          >
            App Operador
          </button>
          <button
            type="button"
            data-testid={LANDING.goTerminal}
            onClick={() => navigate("/terminal/login")}
            className="group flex min-h-[40px] items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.98]"
          >
            <span>Abrir Terminal</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            data-testid={LANDING.navMenuToggle}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menú desplegable móvil */}
      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:hidden">
          <nav className="flex flex-col gap-2" aria-label="Navegación móvil">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                {s.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/login"); }}
                className="w-full rounded-lg bg-slate-100 py-2.5 text-center text-xs font-bold text-slate-800"
              >
                App Operador
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/dueno/login"); }}
                className="w-full rounded-lg bg-slate-100 py-2.5 text-center text-xs font-bold text-slate-800"
              >
                Panel Socio / Dueño
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
