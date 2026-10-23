import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { Capacidades } from "@/components/landing/Capacidades";
import { Explorador } from "@/components/landing/Explorador";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { Beneficios } from "@/components/landing/Beneficios";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { Contact, abrirWhatsAppVentas } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import { T, scrollToId } from "@/components/landing/motion";
import { LANDING } from "@/constants/testIds";

// Acceso directo a WhatsApp: aparece al dejar atrás el hero (ahí ya está el CTA principal).
function WhatsAppFlotante() {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const on = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          data-testid={LANDING.whatsappFlotante}
          onClick={() => abrirWhatsAppVentas("Hola TaxiHUB, quiero información para mi central de taxis.")}
          aria-label="Escríbenos por WhatsApp"
          initial={reduce ? false : { opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: T.comp }}
          exit={{ opacity: 0, y: 8, scale: 0.95, transition: T.micro }}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[#22C55E]/40 bg-[#0A121D] text-[#4ADE80] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.9)] transition-colors hover:bg-[#22C55E] hover:text-[#03140A]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
            <path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4a.5.5 0 0 0 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();
  const [pestana, setPestana] = useState("despacho");

  useEffect(() => {
    const previo = document.title;
    document.title = "taxiHUB — Central y Despacho Satelital";
    return () => {
      document.title = previo;
    };
  }, []);

  const explorar = useCallback(
    (clave) => {
      setPestana(clave);
      scrollToId("producto", reduce);
    },
    [reduce]
  );

  return (
    <div data-testid={LANDING.page} className="th-landing dark relative min-h-[100dvh] w-full overflow-x-clip selection:bg-brand/30 selection:text-white">
      <a href="#contenido-principal" className="ld-skip">
        Saltar al contenido principal
      </a>
      <LandingNav />
      <main id="contenido-principal" className="relative z-10">
        <Hero />
        <Capacidades onExplorar={explorar} />
        <Explorador pestana={pestana} setPestana={setPestana} />
        <ComoFunciona />
        <Beneficios />
        <Pricing />
        <FAQ />
        <Contact />
      </main>
      <Footer />
      <WhatsAppFlotante />
    </div>
  );
}
