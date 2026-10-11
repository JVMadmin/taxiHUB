import React, { useState } from "react";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { DispatchSim } from "@/components/landing/DispatchSim";
import { ProductStory } from "@/components/landing/ProductStory";
import { Features } from "@/components/landing/Features";
import { VideoSection } from "@/components/landing/VideoSection";
import { Pricing } from "@/components/landing/Pricing";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import { LANDING } from "@/constants/testIds";

export default function LandingPage() {
  const [units, setUnits] = useState(25);

  return (
    <div
      data-testid={LANDING.page}
      className="th-landing relative min-h-[100dvh] w-full overflow-x-hidden bg-white text-slate-900 selection:bg-emerald-500/20 selection:text-emerald-950"
    >
      <a href="#contenido-principal" className="l-skip">
        Saltar al contenido principal
      </a>

      {/* Iluminación atmosférica suave de día (Light/Day mode) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/4 h-[36rem] w-[36rem] rounded-full bg-emerald-100/40 blur-[130px]" />
        <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-sky-100/40 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 h-[28rem] w-[44rem] rounded-full bg-slate-100/70 blur-[130px]" />
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
    </div>
  );
}
