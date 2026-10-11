import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export const EASE = [0.32, 0.72, 0, 1];

// Revelado al entrar en viewport. Con movimiento reducido renderiza el estado final.
export function Reveal({ children, delay = 0, y = 24, className, as = "div", ...rest }) {
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
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
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

export function scrollToId(id, reduce) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  try { window.history.replaceState(null, "", `#${id}`); } catch (_) { /* noop */ }
}

export const Eyebrow = ({ children }) => (
  <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">
    <span aria-hidden="true" className="h-px w-6 bg-emerald-400/60" />
    {children}
  </span>
);
