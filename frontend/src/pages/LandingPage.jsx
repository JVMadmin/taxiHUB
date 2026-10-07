import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/Brand";

const LIVE_UNITS = [
  { id: "TX-101", x: 28, y: 36, status: "libre", speed: "34 km/h", driver: "Carlos M." },
  { id: "TX-104", x: 62, y: 28, status: "ocupado", speed: "42 km/h", driver: "Roberto G." },
  { id: "TX-108", x: 46, y: 58, status: "libre", speed: "29 km/h", driver: "Miguel A." },
  { id: "TX-112", x: 74, y: 64, status: "libre", speed: "38 km/h", driver: "Jorge L." },
  { id: "TX-119", x: 22, y: 68, status: "ocupado", speed: "45 km/h", driver: "Luis F." },
  { id: "TX-125", x: 53, y: 42, status: "libre", speed: "31 km/h", driver: "Fernando R." },
];

const HOTSPOTS_DEMO = [
  { key: "1", name: "Terminal ADO", eta: "2 min", unit: "#TX-101" },
  { key: "2", name: "Hospital General", eta: "3 min", unit: "#TX-125" },
  { key: "3", name: "Mercado Central", eta: "1 min", unit: "#TX-108" },
  { key: "4", name: "Zona Arqueológica", eta: "4 min", unit: "#TX-112" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [selectedPoi, setSelectedPoi] = useState(HOTSPOTS_DEMO[0]);
  const [dispatchedPulse, setDispatchedPulse] = useState(false);
  const [activeShowcase, setActiveShowcase] = useState("terminal");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 100);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const triggerDemoDispatch = (poi) => {
    setSelectedPoi(poi);
    setDispatchedPulse(true);
    setTimeout(() => setDispatchedPulse(false), 1600);
  };

  return (
    <div
      data-testid="taxihub-landing-page"
      className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#050505] text-[#F5F5F7] selection:bg-[#10B981]/30 selection:text-white"
    >
      {/* Ambient Radial Mesh Glows (Fixed GPU-safe layer) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/4 h-[36rem] w-[36rem] rounded-full bg-[#10B981]/[0.07] blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-[#4F5DFF]/[0.08] blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 h-[28rem] w-[44rem] rounded-full bg-[#F59E0B]/[0.05] blur-[140px]" />
      </div>

      {/* Floating Fluid Island Navbar */}
      <header className="sticky top-6 z-40 px-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between rounded-full border border-white/10 bg-[#0B0D10]/85 px-4 py-2.5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
          <div className="flex items-center gap-3 pl-2">
            <BrandMark size="sm" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-sm font-bold tracking-tight text-white">
                taxihub<span className="text-[#10B981]">.cloud</span>
              </span>
              <span className="hidden rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#10B981] sm:inline-block">
                V4.2 PRO MAX
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-xs font-medium text-[#9CA0AA] md:flex">
            <a href="#arquitectura" className="transition-colors duration-500 hover:text-white">
              Arquitectura
            </a>
            <a href="#whatsapp-antiban" className="transition-colors duration-500 hover:text-white">
              WhatsApp QR
            </a>
            <a href="#ecosistema" className="transition-colors duration-500 hover:text-white">
              Apps Nativas
            </a>
            <a href="#seguridad" className="transition-colors duration-500 hover:text-white">
              Multi-Tenant
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="landing-go-operador"
              onClick={() => navigate("/login")}
              className="hidden rounded-full px-4 py-2 text-xs font-semibold text-[#9CA0AA] transition-all duration-500 hover:bg-white/[0.06] hover:text-white sm:inline-flex"
            >
              App Operador
            </button>
            <button
              type="button"
              data-testid="landing-go-terminal"
              onClick={() => navigate("/terminal")}
              className="group flex items-center gap-2.5 rounded-full bg-[#10B981] pl-5 pr-2 py-1.5 text-xs font-bold text-[#050505] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
            >
              <span>Abrir Terminal</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/15 text-[#050505] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105">
                ↗
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION — Editorial Split + Interactive Telemetry Radar */}
      <section className="relative mx-auto max-w-7xl px-4 pt-16 pb-28 md:px-8 md:pt-24 md:pb-36">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          {/* Left Column: Editorial Typography */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            className="lg:col-span-6"
          >
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#10B981]">
                PLATAFORMA INTEGRAL DE RADIodESPACHO Y TELEMETRÍA
              </span>
            </div>

            <h1 className="font-display text-4xl font-extrabold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Despacho táctico en{" "}
              <span className="bg-gradient-to-r from-[#10B981] via-[#34D399] to-[#4F5DFF] bg-clip-text text-transparent">
                1.4 segundos
              </span>{" "}
              para sitios de taxi.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#9CA0AA] sm:text-lg">
              Diseñado para agrupaciones y centrales de taxi que exigen control total: aplicación nativa de Windows para la operadora, WhatsApp automático sin pagar API por mensaje, GPS y voz IA 24/7 con pantalla apagada, y liquidación diaria de cuotas para dueños de flota.
            </p>

            {/* Primary CTA Island Buttons */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-testid="landing-cta-terminal"
                onClick={() => navigate("/terminal")}
                className="group flex items-center gap-3 rounded-full bg-white pl-6 pr-2.5 py-2.5 text-sm font-bold text-[#050505] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                <span>Entrar a Central de Despacho</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-[#050505] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105">
                  ↗
                </span>
              </button>

              <button
                type="button"
                data-testid="landing-cta-dueno"
                onClick={() => navigate("/dueno/login")}
                className="group flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] pl-6 pr-2.5 py-2.5 text-sm font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.08] active:scale-[0.98]"
              >
                <span>Panel Socio / Dueño</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                  →
                </span>
              </button>
            </div>

            {/* Key Telemetry Metrics Bar */}
            <div className="mt-12 grid grid-cols-3 gap-4 pt-8 border-t border-white/10">
              <div>
                <div className="font-mono text-2xl font-bold text-white sm:text-3xl">$0 USD</div>
                <div className="mt-1 text-xs text-[#9CA0AA]">Costo por mensaje WhatsApp QR</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-[#10B981] sm:text-3xl">100%</div>
                <div className="mt-1 text-xs text-[#9CA0AA]">Aislamiento Multi-Sitio (Tenant)</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-white sm:text-3xl">24/7</div>
                <div className="mt-1 text-xs text-[#9CA0AA]">GPS + Voz IA con pantalla apagada</div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Double-Bezel Interactive Live Dispatch Simulator */}
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease: [0.32, 0.72, 0, 1] }}
            className="lg:col-span-6"
          >
            {/* Outer Shell (Double-Bezel Architecture) */}
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-2">
              {/* Inner Core */}
              <div className="relative overflow-hidden rounded-[calc(2rem-0.5rem)] bg-[#0B0D10] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                      RADAR EN VIVO · SIMULADOR DE DESPACHO 1-CLIC
                    </span>
                  </div>
                  <span className="rounded-full bg-[#4F5DFF]/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#8A94FF]">
                    25 UNIDADES ACTIVAS
                  </span>
                </div>

                {/* Simulated Dark Tactical Map Canvas */}
                <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#07090D]">
                  {/* Tactical street grid lines */}
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                      backgroundSize: "36px 36px",
                    }}
                  />

                  {/* Radar sweep ring */}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#10B981]/20" />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#10B981]/30" />

                  {/* Animated Taxi Units */}
                  {LIVE_UNITS.map((u, idx) => {
                    const offsetX = ((tick + idx * 7) % 5) - 2;
                    const offsetY = ((tick + idx * 11) % 5) - 2;
                    const isSelected = selectedPoi?.unit === `#${u.id}`;
                    return (
                      <div
                        key={u.id}
                        style={{
                          transform: `translate3d(${(u.x + offsetX) * 3.8}px, ${(u.y + offsetY) * 2.4}px, 0)`,
                        }}
                        className="absolute left-4 top-4 transition-transform duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      >
                        <div
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold shadow-lg ${
                            isSelected
                              ? "bg-[#10B981] text-[#050505] ring-4 ring-[#10B981]/30"
                              : u.status === "libre"
                              ? "border border-[#10B981]/50 bg-[#0B0D10]/90 text-[#10B981]"
                              : "border border-[#F59E0B]/50 bg-[#0B0D10]/90 text-[#F59E0B]"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {u.id}
                        </div>
                      </div>
                    );
                  })}

                  {/* Dispatch Confirmation Toast inside Radar */}
                  <AnimatePresence>
                    {dispatchedPulse && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-[#10B981]/40 bg-[#0B0D10]/95 px-4 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#10B981]">
                            ⚡ {selectedPoi.unit} despachado a {selectedPoi.name}
                          </span>
                          <p className="text-[11px] text-[#9CA0AA]">
                            Auto-respuesta WhatsApp enviada con placas, modelo y ETA ({selectedPoi.eta})
                          </p>
                        </div>
                        <span className="rounded-full bg-[#10B981]/20 px-2.5 py-1 font-mono text-[10px] font-bold text-[#10B981]">
                          EN CAMINO
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Interactive Hotspots Bar (Botonera de Puntos Calientes) */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-[#9CA0AA]">
                    <span className="font-semibold uppercase tracking-wider text-white/80">
                      Prueba la Botonera de Puntos Calientes (1-Clic):
                    </span>
                    <span className="font-mono text-[10px] text-[#10B981]">
                      Atajos rápidos 1–4
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {HOTSPOTS_DEMO.map((poi) => (
                      <button
                        key={poi.key}
                        type="button"
                        onClick={() => triggerDemoDispatch(poi)}
                        className={`rounded-xl border px-3 py-2 text-left transition-all duration-500 active:scale-[0.98] ${
                          selectedPoi.key === poi.key
                            ? "border-[#10B981]/60 bg-[#10B981]/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-[#9CA0AA] hover:border-white/25 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white">
                            [{poi.key}]
                          </span>
                          <span className="text-[#10B981]">{poi.eta}</span>
                        </div>
                        <div className="mt-1 truncate text-xs font-bold text-white">
                          {poi.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ASYMMETRICAL BENTO GRID — ARQUITECTURA DE 4 PILARES */}
      <section id="arquitectura" className="mx-auto max-w-7xl px-4 py-24 md:px-8">
        <div className="mb-14 max-w-2xl">
          <span className="inline-block rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#10B981]">
            INGENIERÍA DE CAMPO REAL
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Cada módulo resuelve un cuello de botella real del sitio de taxis.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Card 1: col-span-7 — Velocidad Extrema para la Operadora + App Nativa Windows */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 md:col-span-7"
          >
            <div className="flex h-full flex-col justify-between rounded-[calc(2rem-0.5rem)] bg-[#0B0D10] p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#4F5DFF]/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A94FF]">
                    WINDOWS NATIVE (.EXE) + HOTKEYS
                  </span>
                  <span className="font-mono text-xs text-[#9CA0AA]">F2 · 1-6 · ENTER · ESC</span>
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold text-white">
                  Terminal de Operadora ultrarrápida sin ventanas de confirmación innecesarias
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA0AA]">
                  Eliminamos los bloqueos al despachar unidades &ldquo;A indicaciones del pasajero&rdquo;. La operadora puede despachar en 1 clic desde el menú contextual del mapa, con la botonera de Puntos Calientes (POIs) o usando exclusivamente el teclado con asignación inteligente de la unidad libre más cercana.
                </p>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "F2", desc: "Nuevo Despacho" },
                  { k: "1 - 6", desc: "Elegir Unidad" },
                  { k: "W", desc: "Panel WhatsApp" },
                  { k: "Clic Der.", desc: "Despacho 1-Clic" },
                ].map((item) => (
                  <div
                    key={item.k}
                    className="rounded-2xl border border-white/[0.07] bg-[#12151B] p-3 text-center"
                  >
                    <div className="font-mono text-sm font-bold text-[#10B981]">{item.k}</div>
                    <div className="mt-1 text-[11px] text-[#9CA0AA]">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Card 2: col-span-5 — Escudo WhatsApp QR Sin API (Anti-Ban 6 Capas) */}
          <motion.div
            id="whatsapp-antiban"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-[2rem] border border-[#10B981]/25 bg-[#10B981]/[0.04] p-2 md:col-span-5"
          >
            <div className="flex h-full flex-col justify-between rounded-[calc(2rem-0.5rem)] bg-[#0B0D10] p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)]">
              <div>
                <span className="rounded-full bg-[#10B981]/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#10B981]">
                  OPCIÓN A · PUENTE QR SIN API
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold text-white">
                  WhatsApp con Auto-Respuesta y Escudo Anti-Ban de 6 reglas
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA0AA]">
                  Vincula el teléfono de la central por código QR sin pagar tarifas por conversación. Cuando la operadora asigna una unidad, el sistema responde automáticamente con número económico, vehículo, placas y tiempo estimado.
                </p>
              </div>

              <ul className="mt-6 space-y-2 text-xs text-[#D1D5DB]">
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981]">✓</span> Solo responde a clientes que escribieron primero (&lt;24h)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981]">✓</span> Simulación humana &ldquo;Escribiendo...&rdquo; (1.5s a 3.2s)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981]">✓</span> Variación léxica Spintax en cada mensaje enviado
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981]">✓</span> Cola con límite de frecuencia y sesión persistente
                </li>
              </ul>
            </div>
          </motion.div>

          {/* Card 3: col-span-6 — App Android Operador (GPS 24/7 + Voz IA + Evidencia de Combustible) */}
          <motion.div
            id="ecosistema"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 md:col-span-6"
          >
            <div className="flex h-full flex-col justify-between rounded-[calc(2rem-0.5rem)] bg-[#0B0D10] p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)]">
              <div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                  APP ANDROID OPERADOR · FOREGROUND SERVICE
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold text-white">
                  Ubicación continua con pantalla apagada, Voz IA y control de turno con fotos
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA0AA]">
                  Servicio nativo de segundo plano que mantiene el GPS y la síntesis de voz activos aunque el chofer bloquee el teléfono o abra otra aplicación. Al iniciar y entregar turno exige fotografía de odómetro/combustible y confirmación de entrega de unidad y cuota.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="rounded-xl border border-white/[0.07] bg-[#12151B] p-3">
                  <div className="font-bold text-white">GPS Activo</div>
                  <div className="mt-0.5 text-[10px] text-[#9CA0AA]">Pantalla apagada</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#12151B] p-3">
                  <div className="font-bold text-white">Fotos Turno</div>
                  <div className="mt-0.5 text-[10px] text-[#9CA0AA]">Inicio y Cierre</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#12151B] p-3">
                  <div className="font-bold text-white">Voz IA</div>
                  <div className="mt-0.5 text-[10px] text-[#9CA0AA]">Lectura de viajes</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <a
                  href="/downloads/taxiHUB-operador-debug.apk"
                  download
                  data-testid="download-apk-operador"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/25"
                >
                  📥 Descargar APK Operador (14.9 MB)
                </a>
              </div>
            </div>
          </motion.div>

          {/* Card 4: col-span-6 — Panel Dueño de Flota + Multi-Tenant Dev Panel */}
          <motion.div
            id="seguridad"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 md:col-span-6"
          >
            <div className="flex h-full flex-col justify-between rounded-[calc(2rem-0.5rem)] bg-[#0B0D10] p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)]">
              <div>
                <span className="rounded-full bg-[#F59E0B]/15 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#F59E0B]">
                  SOCIO FLOTILLERO + MULTI-TENANT ESTRICTO
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold text-white">
                  Liquidación de cuotas diarias para dueños y personalización por sitio
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA0AA]">
                  El dueño fija la cuota diaria desde su panel web o app Android, audita las fotos del tablero al cierre del turno y confirma la recepción del efectivo. Desde el Panel de Desarrollador se configura el logotipo, colores, mapa y puntos calientes de cada sitio en su propio tenant aislado.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#12151B] px-4 py-3 text-xs">
                <div>
                  <div className="font-bold text-white">Aislamiento por `sitio_id`</div>
                  <div className="text-[11px] text-[#9CA0AA]">
                    Base de datos, índices y WebSockets blindados por agrupación
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/dev")}
                  className="rounded-full bg-white/10 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  Panel Dev →
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <a
                  href="/downloads/taxiHUB-socio-debug.apk"
                  download
                  data-testid="download-apk-socio"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500/25"
                >
                  📥 Descargar APK Socios (12.3 MB)
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER / DIRECT PORTAL ACCESS */}
      <footer className="border-t border-white/10 bg-[#07090D] py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 sm:flex-row sm:items-center md:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size="sm" />
              <span className="font-display text-lg font-bold text-white">
                taxihub<span className="text-[#10B981]">.cloud</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-[#9CA0AA]">
              Plataforma Multi-Sitio de Despacho, Telemetría y Liquidación de Flotas.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            <a
              href="/downloads/TaxiHub-Setup-Instalador.exe"
              download
              data-testid="download-windows-central"
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-cyan-300 transition-colors hover:bg-cyan-500/25"
            >
              🖥️ App Windows Central (Instalador)
            </a>
            <button
              type="button"
              onClick={() => navigate("/terminal/login")}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white hover:bg-white/10"
            >
              Acceso Operadora
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white hover:bg-white/10"
            >
              App Operador
            </button>
            <button
              type="button"
              onClick={() => navigate("/dueno/login")}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white hover:bg-white/10"
            >
              Panel Dueño
            </button>
            <button
              type="button"
              onClick={() => navigate("/dev")}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[#9CA0AA] hover:text-white"
            >
              Desarrollador
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
