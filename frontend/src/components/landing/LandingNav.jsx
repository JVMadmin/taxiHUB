import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { LANDING } from "@/constants/testIds";
import { DUR, EASE, T, scrollToId } from "./motion";

export const SECTIONS = [
  { id: "inicio", label: "Inicio" },
  { id: "funciones", label: "Funciones" },
  { id: "producto", label: "Producto" },
  { id: "precio", label: "Precios" },
  { id: "contacto", label: "Contacto" },
];

// Sección visible (la que cruza la franja central de la pantalla).
function useSeccionActiva() {
  const [activa, setActiva] = useState("inicio");
  useEffect(() => {
    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) setActiva(e.target.id);
        });
      },
      { rootMargin: "-42% 0px -52% 0px" }
    );
    // Secciones intermedias marcan al enlace más cercano del menú.
    const ids = [...SECTIONS.map((s) => s.id), "como-funciona", "beneficios", "preguntas"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  const mapa = { "como-funciona": "producto", beneficios: "producto", preguntas: "precio" };
  return mapa[activa] || activa;
}

export function LandingNav() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [abierto, setAbierto] = useState(false);
  const [conScroll, setConScroll] = useState(false);
  const activa = useSeccionActiva();

  useEffect(() => {
    const on = () => setConScroll(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;
    const esc = (e) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto]);

  const ir = (e, id) => {
    e.preventDefault();
    setAbierto(false);
    scrollToId(id, reduce);
  };

  return (
    <motion.header
      data-testid={LANDING.nav}
      className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-6"
      initial={reduce ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.demo, ease: EASE }}
    >
      <div className="ld-nav-caja mx-auto max-w-[1200px]" data-scroll={conScroll}>
        <a href="#inicio" onClick={(e) => ir(e, "inicio")} className="flex items-center gap-2.5 rounded-xl" aria-label="TaxiHUB, ir al inicio">
          <BrandMark size="sm" />
          <span className="ld-display text-[1.2rem] font-extrabold tracking-tight">
            taxi<span className="ld-amarillo">HUB</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Secciones">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => ir(e, s.id)} className="ld-nav-enlace" aria-current={activa === s.id ? "true" : undefined}>
              {s.label}
              {activa === s.id && (
                <motion.span layoutId="ld-nav-subrayado" className="ld-nav-subrayado" transition={reduce ? { duration: 0 } : T.comp} />
              )}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button type="button" data-testid={LANDING.goTerminal} onClick={() => navigate("/terminal/login")} className="ld-btn ld-btn--primario ld-btn--chico max-[380px]:hidden">
            Abrir Terminal
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid={LANDING.navMenuToggle}
            onClick={() => setAbierto((o) => !o)}
            aria-expanded={abierto}
            aria-controls="ld-menu-movil"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            className="grid h-11 w-11 place-items-center rounded-xl text-[#E9EEF5] hover:bg-white/5 md:hidden"
          >
            {abierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {abierto && (
          <motion.nav
            id="ld-menu-movil"
            aria-label="Secciones"
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: T.comp }}
            exit={{ opacity: 0, y: -6, transition: T.micro }}
            className="mx-auto mt-2 max-w-[1200px] rounded-2xl border border-[rgba(148,172,204,0.2)] bg-[#07101A]/95 p-3 backdrop-blur-xl md:hidden"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => ir(e, s.id)}
                aria-current={activa === s.id ? "true" : undefined}
                className="flex min-h-[48px] items-center rounded-xl px-3 text-[15px] font-medium text-[#B7C4D4] hover:bg-white/5 aria-[current=true]:text-[#FFE600]"
              >
                {s.label}
              </a>
            ))}
            <div className="mt-2 grid gap-2 border-t border-[rgba(148,172,204,0.12)] pt-3">
              <button type="button" onClick={() => { setAbierto(false); navigate("/terminal/login"); }} className="ld-btn ld-btn--primario min-[381px]:hidden">
                Abrir Terminal
              </button>
              <button type="button" onClick={() => { setAbierto(false); navigate("/dueno/login"); }} className="ld-btn ld-btn--secundario">
                Panel del socio
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
