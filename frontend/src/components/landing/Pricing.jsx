import { Minus, Plus } from "lucide-react";
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
          <Eyebrow>Precio</Eyebrow>
          <h2 id="precio-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Pagas por cada unidad que opera.
          </h2>
          <p className="mt-4 text-[#B4B8C2]">
            Una tarifa mensual por unidad y un único pago de implementación para dejar tu central operando.
            Sin costo por mensaje de WhatsApp.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-7">
          <div data-testid={LANDING.priceCard} className="rounded-[1.75rem] border border-emerald-500/25 bg-emerald-500/[0.04] p-2">
            <div className="rounded-[1.4rem] bg-[#0B0D10] p-6 sm:p-8">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="font-mono text-5xl font-semibold text-white sm:text-6xl">$99</span>
                <span className="pb-2 text-lg text-[#B4B8C2]">MXN al mes <span className="text-white">por unidad</span></span>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-[#12151B] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label htmlFor="precio-unidades" className="text-sm font-semibold text-white">Unidades de tu central</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Quitar una unidad"
                      onClick={() => setUnits(clamp(units - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/[0.07]"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <input
                      id="precio-unidades"
                      data-testid={LANDING.priceUnits}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={units}
                      onChange={(e) => setUnits(clamp(e.target.value))}
                      className="h-11 w-20 rounded-xl border border-white/15 bg-[#0B0D10] text-center font-mono text-lg font-semibold text-white"
                    />
                    <button
                      type="button"
                      aria-label="Agregar una unidad"
                      onClick={() => setUnits(clamp(units + 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/[0.07]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={Math.min(units, 200)}
                  onChange={(e) => setUnits(clamp(e.target.value))}
                  aria-label="Ajustar número de unidades"
                  className="mt-4 h-2 w-full cursor-pointer accent-emerald-500"
                />
                <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-4" aria-live="polite">
                  <span className="text-sm text-[#B4B8C2]">{fmt(units)} {units === 1 ? "unidad" : "unidades"} × $99 =</span>
                  <span data-testid={LANDING.priceTotal} className="font-mono text-2xl font-semibold text-emerald-300">${fmt(total)} MXN <span className="text-sm font-normal text-[#B4B8C2]">al mes</span></span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 sm:p-5">
                <div className="text-sm font-bold text-white">Pago único de implementación</div>
                <p className="mt-1 text-sm text-[#B4B8C2]">
                  Se cobra una sola vez, al arrancar. Te confirmamos el monto al solicitar tu demo.
                </p>
              </div>

              <a
                href="#contacto"
                onClick={(e) => { e.preventDefault(); document.getElementById("contacto")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}
                className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-emerald-500 px-7 text-base font-bold text-[#04130D] transition-colors duration-200 hover:bg-emerald-400 sm:w-auto"
              >
                Solicitar demo con {fmt(units)} {units === 1 ? "unidad" : "unidades"}
              </a>
              <p className="mt-3 text-xs text-[#9CA0AA]">Precios en pesos mexicanos (MXN).</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
