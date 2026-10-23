import React, { useEffect, useState } from "react";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { DispatchSim } from "@/components/landing/DispatchSim";
import { ProductStory } from "@/components/landing/ProductStory";
import { Features } from "@/components/landing/Features";
import { VideoSection } from "@/components/landing/VideoSection";
import { Pricing } from "@/components/landing/Pricing";
import { Contact, abrirWhatsAppVentas } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import { LANDING } from "@/constants/testIds";

function WhatsAppFlotante() {
  return (
    <button
      type="button"
      data-testid={LANDING.whatsappFlotante}
      onClick={() => abrirWhatsAppVentas("Hola TaxiHUB, quiero información para mi central de taxis.")}
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-[#05210f] shadow-[0_12px_40px_-8px_rgba(37,211,102,0.6)] transition-transform hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
        <path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4a.5.5 0 0 0 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
      </svg>
    </button>
  );
}

export default function LandingPage() {
  const [units, setUnits] = useState(25);

  useEffect(() => {
    const previo = document.title;
    document.title = "taxiHUB — Central y Despacho Satelital";
    return () => { document.title = previo; };
  }, []);

  return (
    <div
      data-testid={LANDING.page}
      className="th-landing dark relative min-h-[100dvh] w-full overflow-x-hidden selection:bg-[#FFE600]/30 selection:text-white"
    >
      <a href="#contenido-principal" className="l-skip">
        Saltar al contenido principal
      </a>

      {/* Luz ambiental: brillo amarillo tenue detrás del producto */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60rem] overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-18rem] h-[44rem] w-[70rem] -translate-x-1/2 rounded-full bg-[#FFE600]/[0.08] blur-[140px]" />
        <div className="absolute right-[-10rem] top-[20rem] h-[28rem] w-[28rem] rounded-full bg-[#FF9900]/[0.06] blur-[120px]" />
      </div>

      <LandingNav />

      <main id="contenido-principal" className="relative z-10">
        <Hero />
        <DispatchSim />
        <ProductStory />
        <Features />
        <VideoSection />
        <Pricing units={units} setUnits={setUnits} />
        <Contact />
      </main>

      <Footer />
      <WhatsAppFlotante />
    </div>
  );
}
