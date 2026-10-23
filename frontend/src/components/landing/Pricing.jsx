import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Minus, Plus, Check, ArrowRight } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Cambio, Etiqueta, Reveal, scrollToId } from "./motion";

export const PRECIO_UNIDAD_MXN = 99;
const fmt = (n) => new Intl.NumberFormat("es-MX").format(n);

const INCLUYE = [
  "Terminales de despacho que necesites, en web o Windows",
  "App Android para todos tus choferes y socios",
  "WhatsApp de la central vinculado por QR, sin costo por mensaje",
  "Mapa de tu ciudad con colonias, tarifas y puntos frecuentes",
];

export function Pricing() {
  const reduce = useReducedMotion();
  const [units, setUnits] = useState(25);
  const clamp = (n) => Math.max(1, Math.min(999, Math.round(Number(n) || 1)));
  const total = units * PRECIO_UNIDAD_MXN;

  return (
    <section id="precio" aria-labelledby="precio-titulo" className="ld-seccion">
      <div className="ld-contenedor grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Reveal>
          <Etiqueta>Precio</Etiqueta>
          <h2 id="precio-titulo" className="ld-h2 mt-4">Pagas por unidad activa. Sin comisión por viaje.</h2>
          <p className="ld-lead mt-5 max-w-[34rem]">
            Un precio fijo por unidad para sitios, cooperativas y agrupaciones de radio taxi. Lo que cobran tus choferes
            es de ellos.
          </p>
          <ul className="ld-lista-check mt-8">
            {INCLUYE.map((t) => (
              <li key={t} className="text-[15px] text-[#B7C4D4]">
                <Check className="mt-0.5 h-5 w-5 text-[#FFE600]" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <div data-testid={LANDING.priceCard} className="ld-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(148,172,204,0.12)] pb-6">
            <div>
              <span className="ld-mono text-[11px] uppercase tracking-[0.14em] text-[#FFE600]">Plan Central</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="ld-display text-[3rem] font-extrabold leading-none">${PRECIO_UNIDAD_MXN}</span>
                <span className="ld-mono text-[13px] text-[#8A9BB0]">MXN / mes por unidad</span>
              </div>
            </div>
            <span className="ld-mono rounded-lg border border-[rgba(148,172,204,0.2)] px-2.5 py-1 text-[11px] text-[#B7C4D4]">+ implementación única</span>
          </div>

          <label htmlFor="units-input" className="mt-7 block text-[13px] font-semibold text-[#B7C4D4]">
            ¿Cuántas unidades tiene tu central?
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => setUnits((u) => clamp(u - 5))} className="ld-paso-btn" aria-label="Restar 5 unidades">
              <Minus className="h-4 w-4" />
            </button>
            <input
              id="units-input"
              type="number"
              inputMode="numeric"
              min="1"
              max="999"
              value={units}
              onChange={(e) => setUnits(clamp(e.target.value))}
              data-testid={LANDING.priceUnits}
              className="ld-campo ld-mono flex-1 text-center text-[1.5rem] font-semibold"
            />
            <button type="button" onClick={() => setUnits((u) => clamp(u + 5))} className="ld-paso-btn" aria-label="Sumar 5 unidades">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            value={Math.min(100, Math.max(5, units))}
            onChange={(e) => setUnits(Number(e.target.value))}
            className="ld-rango mt-4"
            aria-label="Unidades activas"
          />

          <div data-testid={LANDING.priceTotal} className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[#FFE600]/25 bg-[#FFE600]/[0.06] p-5">
            <div>
              <span className="block text-[13px] font-semibold text-[#E9EEF5]">Total mensual estimado</span>
              <span className="ld-mono text-[12px] text-[#8A9BB0]">{units} unidades activas</span>
            </div>
            <div className="ld-mono text-right text-[clamp(1.6rem,3vw,2.2rem)] font-semibold text-[#FFE600]" aria-live="polite">
              <Cambio as="span" clave={total} className="inline-block">
                ${fmt(total)}
              </Cambio>{" "}
              <span className="text-[13px] text-[#B7C4D4]">MXN</span>
            </div>
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-[#8A9BB0]">
            La implementación es un pago único: cargamos el mapa de tu ciudad, damos de alta tus sitios, colonias y
            tarifas, y capacitamos a tus operadoras. Te la cotizamos según tu flota.
          </p>
          <a
            href="#contacto"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("contacto", reduce);
            }}
            className="ld-btn ld-btn--primario mt-6 w-full"
          >
            Cotizar mi implementación
            <ArrowRight className="ld-flecha h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
