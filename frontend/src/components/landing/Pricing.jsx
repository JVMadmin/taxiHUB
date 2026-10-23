import { Minus, Plus, Check } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export const PRECIO_UNIDAD_MXN = 99;
const fmt = (n) => new Intl.NumberFormat("es-MX").format(n);

export function Pricing({ units, setUnits }) {
  const clamp = (n) => Math.max(1, Math.min(999, Math.round(Number(n) || 1)));
  const total = units * PRECIO_UNIDAD_MXN;

  return (
    <section id="precio" aria-labelledby="precio-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-start gap-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <Eyebrow>Tarifa transparente</Eyebrow>
          <h2 id="precio-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Solo pagas por unidad activa.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Un precio plano y honesto diseñado para cooperativas, agrupaciones y sitios de radio taxi en México.
          </p>

          <div className="mt-6 space-y-3">
            {[
              "Puente QR de WhatsApp oficial sin comisiones por mensaje",
              "Soporte para terminales Windows ilimitadas en tu central",
              "App móvil para todos los conductores y socios flotilleros",
              "Cartografía local de tu ciudad y configuración de puntos calientes",
            ].map((feature, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                <Check className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <strong className="font-bold">Pago único de implementación inicial:</strong> Incluye la carga personalizada del mapa de tu ciudad, el alta de tus sitios y colonias con tarifas oficiales, y la capacitación directa a tus despachadoras.
          </div>
        </Reveal>

        {/* Tarjeta Calculadora Diurna */}
        <Reveal delay={0.1} className="lg:col-span-7">
          <div
            data-testid={LANDING.priceCard}
            className="rounded-3xl border-2 border-amber-400/40 bg-white p-7 sm:p-9 shadow-2xl shadow-amber-400/10"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-6">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Plan Central Oficial
                </span>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-4xl sm:text-5xl font-extrabold text-slate-900">
                    $99
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-500">
                    MXN / mes por unidad
                  </span>
                </div>
              </div>
            </div>

            {/* Selector de Unidades */}
            <div className="mt-7">
              <label htmlFor="units-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Calcula el costo para tu flota:
              </label>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUnits((u) => clamp(u - 5))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Restar 5 unidades"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="flex-1">
                  <input
                    id="units-input"
                    type="number"
                    min="1"
                    max="999"
                    value={units}
                    onChange={(e) => setUnits(clamp(e.target.value))}
                    data-testid={LANDING.priceUnits}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-center font-mono text-2xl font-extrabold text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setUnits((u) => clamp(u + 5))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Sumar 5 unidades"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Slider interactivo */}
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
                className="mt-4 w-full accent-amber-500"
              />
            </div>

            {/* Total estimado */}
            <div
              data-testid={LANDING.priceTotal}
              className="mt-7 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-amber-950 block">Total mensual estimado:</span>
                <span className="font-mono text-xs text-slate-500">{units} unidades activas</span>
              </div>
              <div className="text-right">
                <div className="font-display font-mono text-3xl sm:text-4xl font-extrabold text-amber-600">
                  ${fmt(total)} <span className="text-sm font-semibold text-amber-950">MXN</span>
                </div>
              </div>
            </div>

            <a
              href="#contacto"
              className="mt-6 block w-full rounded-xl bg-amber-400 py-3.5 text-center text-sm font-bold text-slate-950 shadow-md shadow-amber-400/25 transition-all hover:bg-amber-300 active:scale-[0.98]"
            >
              Solicitar cotización e instalación
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
