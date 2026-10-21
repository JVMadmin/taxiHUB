import { Keyboard, ShieldCheck, BatteryCharging, DollarSign } from "lucide-react";
import { Eyebrow, Reveal } from "./motion";

export function Features() {
  return (
    <section id="funciones" aria-labelledby="features-title" className="border-t border-white/[0.08] bg-transparent py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Diseñado para operaciones reales</Eyebrow>
          <h2 id="features-title" className="font-display mt-3 text-3xl font-extrabold text-white sm:text-4xl">
            Hecho para el trabajo diario de un sitio.
          </h2>
          <p className="mt-3 text-base text-[#a1a6b2]">
            Pensado para sitios y cooperativas de radio taxi en México: rápido para la despachadora y sin comisiones por viaje.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-12">
          {/* Card 1: Windows nativo + Hotkeys (col-span-7) */}
          <Reveal className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 sm:p-8 transition-colors hover:border-white/20 lg:col-span-7">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-400/10 border border-emerald-400/25 px-3 py-1 font-mono text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                Web y Windows
              </span>
              <Keyboard className="h-5 w-5 text-[#6b7280]" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-white">
              Terminal ultrarrápida con atajos de teclado
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#a1a6b2]">
              Sin ventanas emergentes que frenen a la operadora. Despacho directo desde el menú contextual del mapa o usando atajos rápidos de teclado con asignación automática de la unidad más cercana.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
              {[
                { k: "F2", d: "Nuevo servicio" },
                { k: "1 - 6", d: "Elegir unidad" },
                { k: "Enter", d: "Confirmar" },
                { k: "Esc", d: "Cancelar" },
              ].map((item) => (
                <div key={item.k} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
                  <div className="text-emerald-300 font-extrabold text-sm">{item.k}</div>
                  <div className="text-[10px] text-[#8b909c] mt-0.5">{item.d}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Card 2: Escudo WhatsApp QR (col-span-5) */}
          <Reveal delay={0.1} className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 sm:p-8 transition-colors hover:border-white/20 lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-400/10 border border-emerald-400/25 px-3 py-1 font-mono text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                WhatsApp por QR
              </span>
              <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-white">
              WhatsApp de tu central, en la terminal
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#a1a6b2]">
              Vincula el WhatsApp de la central con un código QR (como WhatsApp Web): los pedidos llegan a la terminal y se responden desde ahí, sin costo por mensaje. Usa un número dedicado a la central.
            </p>
            <ul className="mt-5 space-y-2 text-xs text-[#d4d7de] font-medium">
              {[
"Solo responde a pasajeros que escriben primero",
"Muestra “Escribiendo…” antes de cada respuesta",
"Avisa al pasajero la unidad, el chofer y la llegada",
"Pausa entre envíos para cuidar el número",
              ].map((text, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Card 3: App Android Chofer (col-span-6) */}
          <Reveal className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 sm:p-8 transition-colors hover:border-white/20 lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-sky-400/10 border border-sky-400/25 px-3 py-1 font-mono text-[11px] font-bold text-sky-300 uppercase tracking-wider">
                App del chofer
              </span>
              <BatteryCharging className="h-5 w-5 text-sky-300" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-white">
              Navegación 3D, voz y GPS con la pantalla apagada
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#a1a6b2]">
              El teléfono lee el viaje en voz alta, guía al chofer con un mapa 3D hasta el cliente y sigue enviando su ubicación aunque apague la pantalla.
            </p>
          </Reveal>

          {/* Card 4: Liquidación de Flota (col-span-6) */}
          <Reveal delay={0.1} className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 sm:p-8 transition-colors hover:border-white/20 lg:col-span-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-400/10 border border-amber-400/25 px-3 py-1 font-mono text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Dueños de unidades
              </span>
              <DollarSign className="h-5 w-5 text-amber-300" aria-hidden="true" />
            </div>
            <h3 className="font-display mt-5 text-2xl font-bold text-white">
              Cuota diaria y fotos de cada turno
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#a1a6b2]">
              El dueño de las unidades fija la cuota por turno, revisa las fotos del odómetro y combustible al inicio y cierre de jornada, y confirma el efectivo recibido con un clic.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
