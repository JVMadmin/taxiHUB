import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { ESTADOS_OPERADOR } from "@/design/status";
import { LANDING } from "@/constants/testIds";
import { MapaDemo } from "./MapaDemo";
import { useInstantanea, rumboTexto } from "./useFlota";
import { Cambio, useConteo } from "../motion";

const ORDEN = { libre: 0, ocupado: 1, no_disponible: 2 };
// La tarjeta de detalle ocupa la franja inferior del mapa.
const RELLENO_DETALLE = { top: 30, right: 10, bottom: 80, left: 10 };
const colorDe = (u) => ESTADOS_OPERADOR[u.estado]?.color || "#93A4B8";
const textoEstado = (u) => (u.servicio ? "Va por un cliente" : ESTADOS_OPERADOR[u.estado]?.label || u.estado);

function Reloj() {
  const [hora, setHora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="ld-mono">{hora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>;
}

function Contador({ valor, etiqueta, color, activo }) {
  const n = useConteo(valor, { activo });
  return (
    <div className="cd-contador">
      <b style={{ color }}>{n}</b>
      <span>{etiqueta}</span>
    </div>
  );
}

/*
 * Vista compacta de la Terminal para el hero: mapa real con la flota de demostración y el
 * panel de unidades. Seleccionar en la lista o en el mapa sincroniza ambos y el detalle.
 * Teclado: ↑/↓ recorren la lista (selección inmediata), Inicio/Fin saltan a los extremos.
 */
export function CentralDemo({ entrada = false, activo = true }) {
  const datos = useInstantanea(700);
  const [sel, setSel] = useState("042");
  const listaRef = useRef(null);

  const lista = useMemo(() => [...datos].sort((a, b) => (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9) || a.id.localeCompare(b.id)), [datos]);
  const conteo = useMemo(() => {
    const c = { libre: 0, ocupado: 0, no_disponible: 0 };
    datos.forEach((u) => { c[u.estado] = (c[u.estado] || 0) + 1; });
    return c;
  }, [datos]);
  const actual = datos.find((u) => u.id === sel);

  const seleccionar = (id, enfocar = false) => {
    setSel(id);
    if (enfocar) listaRef.current?.querySelector(`[data-id="${id}"]`)?.focus();
    else listaRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onTecla = (e) => {
    const i = lista.findIndex((u) => u.id === sel);
    let j = null;
    if (e.key === "ArrowDown") j = Math.min(lista.length - 1, i + 1);
    else if (e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = lista.length - 1;
    if (j == null) return;
    e.preventDefault();
    seleccionar(lista[j].id, true);
  };

  return (
    <div className="cd" data-testid={LANDING.heroDemo}>
      <div className="cd-barra">
        <BrandMark size="xs" />
        <div className="leading-tight">
          <div className="ld-display text-[13px] font-extrabold tracking-tight">
            taxi<span className="ld-amarillo">HUB</span>
          </div>
          <div className="ld-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8A9BB0]">Central · Palenque</div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[#B7C4D4]">
          <span className="hidden sm:inline"><Reloj /></span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22C55E]/35 bg-[#22C55E]/10 px-2 py-0.5 font-semibold text-[#4ADE80]">
            <span className="ld-punto-vivo" aria-hidden="true" /> En línea
          </span>
        </div>
      </div>

      <div className="cd-cuerpo max-sm:!flex max-sm:flex-col">
        <div className="relative min-h-[260px] max-sm:h-[300px]">
          <MapaDemo
            seleccionId={sel}
            onSeleccionar={(id) => seleccionar(id)}
            entrada={entrada}
            vista={{ zoom: 14.15, pitch: 40, bearing: -14 }}
            relleno={RELLENO_DETALLE}
            etiqueta="Mapa de demostración: flota de taxis en Palenque"
          />
          {actual && (
            <Cambio clave={actual.id} className="cd-detalle" data-testid={LANDING.demoDetalle} aria-live="polite">
                <span className="cd-avatar" aria-hidden="true">{actual.id}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-[13px]">Unidad {actual.id}</strong>
                    <span className="ld-estado" style={{ "--c": colorDe(actual) }}>{textoEstado(actual)}</span>
                  </div>
                  <div className="truncate text-[11.5px] text-[#8A9BB0]">
                    {actual.chofer} · {actual.zona}
                  </div>
                </div>
                <div className="ld-mono text-right text-[11px] leading-tight text-[#B7C4D4]">
                  <div className="text-[15px] font-semibold text-[#E9EEF5]">{actual.kmh}<span className="text-[10px] text-[#8A9BB0]"> km/h</span></div>
                  <div>{actual.kmh ? `rumbo ${rumboTexto(actual.rumbo)}` : "detenida"}</div>
                </div>
            </Cambio>
          )}
        </div>

        <div className="cd-panel max-sm:border-l-0 max-sm:border-t max-sm:border-[rgba(148,172,204,0.12)]">
          <div className="flex items-center justify-between px-3 pb-2 pt-3">
            <span className="text-[12px] font-semibold">Unidades en tiempo real</span>
            <span className="ld-mono text-[10px] text-[#8A9BB0]">{datos.length}</span>
          </div>
          <div className="cd-contadores">
            <Contador valor={conteo.libre} etiqueta="Disponibles" color={ESTADOS_OPERADOR.libre.color} activo={activo} />
            <Contador valor={conteo.ocupado} etiqueta="Ocupadas" color={ESTADOS_OPERADOR.ocupado.color} activo={activo} />
            <Contador valor={conteo.no_disponible} etiqueta="Pausadas" color={ESTADOS_OPERADOR.no_disponible.color} activo={activo} />
          </div>
          <div
            ref={listaRef}
            className="cd-lista max-sm:!flex max-sm:gap-1.5 max-sm:overflow-x-auto max-sm:overflow-y-hidden"
            role="group"
            aria-label="Unidades de demostración. Usa las flechas para recorrerlas."
            onKeyDown={onTecla}
            data-testid={LANDING.demoLista}
          >
            {lista.map((u) => (
              <button
                key={u.id}
                type="button"
                data-id={u.id}
                data-testid={`${LANDING.demoFila}-${u.id}`}
                aria-pressed={u.id === sel}
                tabIndex={u.id === sel ? 0 : -1}
                onClick={() => seleccionar(u.id)}
                className="cd-fila max-sm:w-[168px] max-sm:shrink-0"
              >
                <span className="cd-fila-punto" style={{ "--c": colorDe(u) }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="cd-fila-nombre">Unidad {u.id}</span>
                  <span className="cd-fila-sub">{textoEstado(u)}</span>
                </span>
                <span className="cd-fila-vel">{u.kmh ? `${u.kmh} km/h` : "—"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
