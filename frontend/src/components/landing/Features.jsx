import { Keyboard, ShieldCheck, BatteryCharging, DollarSign } from "lucide-react";
import { Eyebrow, Reveal } from "./motion";

export function Features() {
  return (
    <section id="funciones" aria-labelledby="features-title" className="border-t border-slate-200/80 bg-slate-50/60 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Diseñado para operaciones reales</Eyebrow>
          <h2 id="features-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Cada función resuelve un dolor diario del sitio.
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Probado en centrales reales de Chiapas: rapidez máxima para la despachadora y cero comisiones sorpresa.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-12">
          {/* Card 1: Windows nativo + Hotkeys (col-span-7) */}
          <Reveal className="rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm hover:shadow-md transition-shadow lg:col-span-7">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 font-mono text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Windows Nativo (.exe)
              </span>
              <Keyboard className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-slate-900">
              Terminal ultrarrápida con atajos de teclado
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Sin ventanas emergentes que frenen a la operadora. Despacho directo desde el menú contextual del mapa o usando atajos rápidos de teclado con asignación automática de la unidad más cercana.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
              {[
                { k: "F2", d: "Nuevo servicio" },
                { k: "1 - 6", d: "Elegir unidad" },
                { k: "Enter", d: "Confirmar" },
                { k: "Esc", d: "Cancelar" },
              ].map((item) => (
                <div key={item.k} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <div className="text-amber-600 font-extrabold text-sm">{item.k}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.d}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Card 2: Escudo WhatsApp QR (col-span-5) */}
          <Reveal delay={0.1} className="rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm hover:shadow-md transition-shadow lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 font-mono text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Puente QR Directo
              </span>
              <ShieldCheck className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-slate-900">
              WhatsApp con escudo anti-bloqueo
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Conecta el número oficial de tu central por código QR sin pagar tarifas por mensaje.
            </p>
            <ul className="mt-5 space-y-2 text-xs text-slate-700 font-medium">
              {[
                "Solo responde a pasajeros que escriben primero",
                "Simulación humana 'Escribiendo...' (1.5s a 3.2s)",
                "Variación léxica de textos para evitar patrones",
                "Cola inteligente con límite de frecuencia seguro",
              ].map((text, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-amber-500 font-bold">✓</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Card 3: App Android Chofer (col-span-6) */}
          <Reveal className="rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm hover:shadow-md transition-shadow lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-sky-50 border border-sky-200 px-3 py-1 font-mono text-[11px] font-bold text-sky-800 uppercase tracking-wider">
                Android Foreground Service
              </span>
              <BatteryCharging className="h-5 w-5 text-sky-600" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-slate-900">
              GPS continuo con pantalla apagada y Voz IA
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              El chofer no necesita tocar la pantalla mientras conduce. El teléfono lee el servicio por voz alta y transmite su ubicación exacta en segundo plano, optimizando el consumo de batería.
            </p>
          </Reveal>

          {/* Card 4: Liquidación de Flota (col-span-6) */}
          <Reveal delay={0.1} className="rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm hover:shadow-md transition-shadow lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 font-mono text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Control de Concesionarios
              </span>
              <DollarSign className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-slate-900">
              Liquidación diaria de cuota y fotos de turno
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              El dueño de las unidades fija la cuota por turno, revisa las fotos del odómetro y combustible al inicio y cierre de jornada, y confirma el efectivo recibido con un clic.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
