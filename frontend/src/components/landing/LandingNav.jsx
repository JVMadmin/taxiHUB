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
    <header className="sticky top-3 z-40 px-3 sm:top-5 sm:px-4" data-testid={LANDING.nav}>
      <div className="mx-auto max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0B0D10]/85 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <a href="#inicio" onClick={(e) => go(e, "inicio")} aria-label="TaxiHUB — inicio" className="rounded-xl">
            <BrandLockup markSize="sm" />
          </a>

          <nav aria-label="Secciones" className="hidden items-center gap-1 md:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-[#B4B8C2] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={LANDING.goTerminal}
              onClick={() => navigate("/terminal")}
              className="hidden min-h-[44px] items-center rounded-full border border-white/15 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/[0.07] sm:inline-flex"
            >
              Entrar a Central
            </button>
            <a
              href="#contacto"
              onClick={(e) => go(e, "contacto")}
              data-testid={LANDING.ctaDemo}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-bold text-[#04130D] transition-colors duration-200 hover:bg-emerald-400"
            >
              Solicitar demo
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <button
              type="button"
              data-testid={LANDING.navMenuToggle}
              aria-expanded={open}
              aria-controls="landing-mobile-menu"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.07] md:hidden"
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {open && (
          <div id="landing-mobile-menu" className="border-t border-white/10 px-3 pb-3 pt-2 md:hidden">
            <nav aria-label="Secciones (móvil)" className="grid">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => go(e, s.id)}
                  className="flex min-h-[48px] items-center rounded-xl px-3 text-base font-medium text-white hover:bg-white/[0.06]"
                >
                  {s.label}
                </a>
              ))}
              <button
                type="button"
                data-testid={LANDING.goOperador}
                onClick={() => navigate("/login")}
                className="flex min-h-[48px] items-center rounded-xl px-3 text-left text-base font-medium text-[#B4B8C2] hover:bg-white/[0.06]"
              >
                App Operador
              </button>
              <button
                type="button"
                onClick={() => navigate("/terminal")}
                className="flex min-h-[48px] items-center rounded-xl px-3 text-left text-base font-medium text-[#B4B8C2] hover:bg-white/[0.06] sm:hidden"
              >
                Entrar a Central
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
