import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/*
 * Sistema de movimiento de la landing (un solo lenguaje para toda la página).
 *  - micro  (≈160 ms): botones, enlaces, estados de foco y selección.
 *  - comp   (≈280 ms): paneles que cambian de contenido, acordeones, pestañas.
 *  - demo   (≈520 ms): cambios de demostración y revelado de títulos de sección.
 *  - entrada: coreografía del hero (escalonada, solo una vez).
 * Curvas: EASE (salida suave, para lo que aparece) y EASE_IO (cambios de estado).
 * Con `prefers-reduced-motion` todo se muestra en su estado final y la demo no avanza sola.
 * Los mismos valores existen como variables CSS en landing.css (--ld-micro, --ld-comp…).
 */
export const DUR = { micro: 0.16, comp: 0.28, demo: 0.52, entrada: 0.72 };
export const EASE = [0.22, 1, 0.36, 1];
export const EASE_IO = [0.65, 0, 0.35, 1];
export const T = {
  micro: { duration: DUR.micro, ease: EASE },
  comp: { duration: DUR.comp, ease: EASE_IO },
  demo: { duration: DUR.demo, ease: EASE },
};

// Cambio de contenido dentro de un mismo marco (pestañas, unidad seleccionada…).
export const cambioPanel = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: T.comp },
  exit: { opacity: 0, y: -6, transition: { duration: DUR.micro, ease: EASE_IO } },
};

/*
 * Cambio de contenido en un mismo marco: el contenido nuevo entra (opacidad + 8 px) y el
 * anterior se retira al instante. No usa AnimatePresence mode="wait": con React 19 esa
 * espera a veces nunca termina y el panel se queda con el contenido viejo.
 * El primer render no anima (no compite con la entrada de la página).
 */
export function Cambio({ clave, as = "div", className, children, ...rest }) {
  const reduce = useReducedMotion();
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
  }, []);
  const Comp = motion[as] || motion.div;
  return (
    <Comp
      key={clave}
      className={className}
      initial={reduce || !montado.current ? false : cambioPanel.initial}
      animate={cambioPanel.animate}
      {...rest}
    >
      {children}
    </Comp>
  );
}

// Revelado de encabezados de sección: una sola vez, sin repetirlo en cada tarjeta.
export function Reveal({ children, delay = 0, y = 14, className, as = "div", ...rest }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] || motion.div;
  if (reduce) {
    const Plain = as;
    return <Plain className={className} {...rest}>{children}</Plain>;
  }
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: DUR.demo, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// Cursor real (no táctil): solo ahí se activan los efectos de profundidad por puntero.
export const usePunteroFino = () => useMediaQuery("(hover: hover) and (pointer: fine)");

// true mientras el elemento está (casi) en pantalla.
export function useEnVista(ref, margen = "120px") {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: margen });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margen]);
  return visible;
}

export function scrollToId(id, reduce) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  try {
    window.history.replaceState(null, "", `#${id}`);
  } catch (_) {
    /* noop */
  }
}

/*
 * Profundidad discreta según el cursor: unos pocos grados y píxeles, con resorte que
 * vuelve a reposo al salir. Solo con puntero fino y sin movimiento reducido; en táctil
 * el elemento queda quieto (la interacción equivalente es tocar y seleccionar).
 */
export function useInclinacion({ grados = 3.5, px = 6 } = {}) {
  const reduce = useReducedMotion();
  const fino = usePunteroFino();
  const activo = fino && !reduce;
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const resorte = { stiffness: 120, damping: 20, mass: 0.7 };
  const rotateX = useSpring(rx, resorte);
  const rotateY = useSpring(ry, resorte);
  const x = useSpring(tx, resorte);
  const y = useSpring(ty, resorte);

  const onPointerMove = useCallback(
    (e) => {
      if (!activo || e.pointerType !== "mouse") return;
      const r = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      ry.set(nx * grados);
      rx.set(-ny * grados);
      tx.set(nx * px);
      ty.set(ny * px);
    },
    [activo, grados, px, rx, ry, tx, ty]
  );
  const onPointerLeave = useCallback(() => {
    rx.set(0);
    ry.set(0);
    tx.set(0);
    ty.set(0);
  }, [rx, ry, tx, ty]);

  return {
    activo,
    estilo: activo ? { rotateX, rotateY, x, y, transformPerspective: 1400 } : undefined,
    eventos: activo ? { onPointerMove, onPointerLeave } : {},
  };
}

// Contador que sube hasta el valor (para los indicadores que se activan en el hero).
export function useConteo(valor, { activo = true, ms = 900 } = {}) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce || !activo ? valor : 0);
  const desde = useRef(0);
  useEffect(() => {
    if (reduce || !activo) {
      setN(valor);
      return undefined;
    }
    const inicio = performance.now();
    const origen = desde.current;
    let raf;
    const tick = (ahora) => {
      const p = Math.min(1, (ahora - inicio) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(origen + (valor - origen) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else desde.current = valor;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, activo, ms, reduce]);
  return n;
}

export const Etiqueta = ({ children, className = "" }) => (
  <span className={`ld-etiqueta ${className}`}>{children}</span>
);
