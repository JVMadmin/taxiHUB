import { useState } from "react";
import { LANDING } from "@/constants/testIds";
import { Cambio } from "../motion";

/*
 * Captura real del producto con puntos numerados. Cada punto (o su fila en la lista) es un
 * botón: al elegirlo se resalta en la imagen y se explica. Funciona igual con clic, toque y
 * teclado; nada depende del hover.
 */
export function CapturaGuiada({ variante, imagen, ancho, alto, alt, puntos, url }) {
  const [activo, setActivo] = useState(puntos[0].clave);
  const actual = puntos.find((p) => p.clave === activo);
  const indice = puntos.indexOf(actual);

  const imagenConPuntos = (
    <div className={`ld-captura ${variante === "navegador" ? "ld-captura--ajustada" : ""}`}>
      <img src={imagen} width={ancho} height={alto} alt={alt} loading="lazy" decoding="async" />
      {puntos.map((p, i) => (
        <button
          key={p.clave}
          type="button"
          className="ld-punto"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          aria-pressed={p.clave === activo}
          aria-label={`${i + 1}. ${p.titulo}`}
          data-testid={`${LANDING.hotspot}-${p.clave}`}
          onClick={() => setActivo(p.clave)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );

  const explicacion = (
    <Cambio clave={actual.clave} aria-live="polite">
        <span className="ld-mono text-[11px] text-[#FFE600]">
          {String(indice + 1).padStart(2, "0")} / {String(puntos.length).padStart(2, "0")}
        </span>
        <h3 className="ld-h3 mt-1.5">{actual.titulo}</h3>
        <p className="ld-cuerpo mt-1.5 text-[14px]">{actual.texto}</p>
    </Cambio>
  );

  const lista = (
    <ol className="mt-4 grid gap-1">
      {puntos.map((p, i) => (
        <li key={p.clave}>
          <button
            type="button"
            onClick={() => setActivo(p.clave)}
            aria-pressed={p.clave === activo}
            className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-2 text-left text-[13px] text-[#B7C4D4] transition-colors hover:bg-white/[0.04] aria-pressed:bg-[#FFE600]/[0.08] aria-pressed:text-[#E9EEF5]"
          >
            <span className="ld-mono grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#FFE600]/50 text-[11px] text-[#FFE600]">{i + 1}</span>
            {p.titulo}
          </button>
        </li>
      ))}
    </ol>
  );

  if (variante === "telefono") {
    return (
      <div className="grid h-full items-center gap-6 bg-[radial-gradient(40rem_26rem_at_30%_40%,rgba(56,107,170,0.14),transparent)] p-5 md:grid-cols-[minmax(0,1fr)_300px] md:p-8">
        <div className="ld-telefono-guiado mx-auto">
          <div className="ld-telefono">{imagenConPuntos}</div>
        </div>
        <div className="md:pr-2">
          <span className="ld-mono text-[10.5px] uppercase tracking-[0.12em] text-[#8A9BB0]">Captura real · App del chofer</span>
          <div className="mt-3">{explicacion}</div>
          {lista}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#07101A] p-3 md:p-5">
      <div className="ld-navegador min-h-0 flex-1 overflow-hidden">
        <div className="ld-navegador-barra" aria-hidden="true">
          <i /><i /><i />
          <span className="ld-navegador-url">{url}</span>
        </div>
        <div className="flex justify-center bg-[#050B12] md:h-[calc(100%-34px)]">{imagenConPuntos}</div>
      </div>
      <div className="mt-3 grid gap-3 rounded-2xl border border-[rgba(148,172,204,0.14)] bg-[#0A121D] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        {explicacion}
        <div className="flex gap-1.5" role="group" aria-label="Puntos de la captura">
          {puntos.map((p, i) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setActivo(p.clave)}
              aria-pressed={p.clave === activo}
              aria-label={`${i + 1}. ${p.titulo}`}
              className="ld-mono grid h-9 w-9 place-items-center rounded-full border border-[rgba(148,172,204,0.2)] text-[12px] text-[#B7C4D4] transition-colors hover:border-[#FFE600]/60 aria-pressed:border-[#FFE600] aria-pressed:bg-[#FFE600] aria-pressed:text-[#050B12]"
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
