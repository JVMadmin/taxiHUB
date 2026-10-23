import { Crosshair } from "lucide-react";
import { ESTADOS_OPERADOR } from "@/design/status";
import { LANDING } from "@/constants/testIds";
import { useInstantanea, rumboTexto } from "./useFlota";
import { Cambio } from "../motion";

const colorDe = (u) => ESTADOS_OPERADOR[u.estado]?.color || "#93A4B8";
const textoEstado = (u) => (u.servicio ? "Va por un cliente" : ESTADOS_OPERADOR[u.estado]?.label || u.estado);

export function HojaSeguimiento({ sel, onSel, seguir, onSeguir }) {
  const datos = useInstantanea(500);
  const u = datos.find((d) => d.id === sel);

  return (
    <div className="ld-hoja" aria-label="Seguimiento de una unidad">
      <div className="ld-hoja-cab">
        <span className="text-[13px] font-semibold">Seguimiento GPS</span>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Elige una unidad">
          {datos.map((d) => (
            <button
              key={d.id}
              type="button"
              data-testid={`${LANDING.seguimientoChip}-${d.id}`}
              aria-pressed={d.id === sel}
              onClick={() => onSel(d.id)}
              className="ld-mono flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(148,172,204,0.14)] px-2.5 text-[11.5px] text-[#B7C4D4] transition-colors hover:border-[#FFE600]/50 aria-pressed:border-[#FFE600] aria-pressed:bg-[#FFE600]/10 aria-pressed:text-[#FFE600]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: colorDe(d) }} aria-hidden="true" />
              {d.id}
            </button>
          ))}
        </div>
      </div>
      <div className="ld-hoja-cuerpo">
        {u && (
          <Cambio clave={u.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="ld-h3">Unidad {u.id}</h3>
                  <p className="text-[12.5px] text-[#8A9BB0]">{u.chofer}</p>
                </div>
                <span className="ld-estado" style={{ "--c": colorDe(u) }}>{textoEstado(u)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[rgba(148,172,204,0.12)] bg-[#050B12] p-3">
                  <div className="ld-mono text-[22px] font-semibold leading-none">{u.kmh}</div>
                  <div className="mt-1 text-[11px] text-[#8A9BB0]">km/h</div>
                </div>
                <div className="rounded-xl border border-[rgba(148,172,204,0.12)] bg-[#050B12] p-3">
                  <div className="ld-mono text-[22px] font-semibold leading-none">{u.kmh ? rumboTexto(u.rumbo) : "—"}</div>
                  <div className="mt-1 text-[11px] text-[#8A9BB0]">rumbo</div>
                </div>
              </div>
              <dl className="mt-3">
                <div className="ld-dato"><dt>Zona</dt><dd>{u.zona}</dd></div>
                <div className="ld-dato"><dt>Señal GPS</dt><dd style={{ color: "#4ADE80" }}>al momento</dd></div>
              </dl>
              <p className="mt-3 flex items-center gap-2 text-[12px] text-[#8A9BB0]">
                <span className="inline-block h-[3px] w-6 rounded bg-gradient-to-r from-transparent to-[#FFE600]" aria-hidden="true" />
                Línea amarilla: recorrido reciente de la unidad.
              </p>
          </Cambio>
        )}
        <button
          type="button"
          data-testid={LANDING.seguirUnidad}
          aria-pressed={seguir}
          onClick={() => onSeguir(!seguir)}
          className="ld-btn ld-btn--secundario ld-btn--chico mt-4 w-full aria-pressed:border-[#FFE600] aria-pressed:text-[#FFE600]"
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
          {seguir ? "Siguiendo la unidad" : "Seguir la unidad"}
        </button>
        <p className="mt-2 text-[11.5px] text-[#8A9BB0]">Arrastra el mapa para dejar de seguirla.</p>
      </div>
    </div>
  );
}
