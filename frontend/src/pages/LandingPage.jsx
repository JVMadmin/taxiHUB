import React, { useState } from "react";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { DispatchSim } from "@/components/landing/DispatchSim";
import { ProductStory } from "@/components/landing/ProductStory";
import { Features } from "@/components/landing/Features";
import { VideoSection } from "@/components/landing/VideoSection";
import { Apps } from "@/components/landing/Apps";
import { Pricing } from "@/components/landing/Pricing";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import { LANDING } from "@/constants/testIds";

export default function LandingPage() {
  const [units, setUnits] = useState(25);

  return (
    <div
      data-testid={LANDING.page}
      className="th-landing relative min-h-[100dvh] w-full overflow-x-hidden bg-[#050505] text-[#F5F5F7] selection:bg-emerald-500/30 selection:text-white"
    >
      <a href="#contenido-principal" className="l-skip">
        Saltar al contenido principal
      </a>

      {/* Ambient Radial Mesh Glows (Fixed GPU-safe layer) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-48 left-1/4 h-[36rem] w-[36rem] rounded-full bg-emerald-500/[0.07] blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-cyan-500/[0.06] blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 h-[28rem] w-[44rem] rounded-full bg-emerald-600/[0.04] blur-[140px]" />
      </div>

      <LandingNav />

      <main id="contenido-principal" className="relative z-10">
        <Hero />
        <DispatchSim />
        <ProductStory />
        <Features />
        <VideoSection />
        <Apps />
        <Pricing units={units} setUnits={setUnits} />
        <Contact />
      </main>

      <Footer />
    </div>
  );
}
