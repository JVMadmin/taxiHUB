import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Cambio, Etiqueta, Reveal, T } from "./motion";

// Beneficios concretos por rol, sin cifras inventadas.
const ROLES = [
  {
    clave: "central",
    nombre: "Central y operadoras",
    titulo: "Menos llamadas de ida y vuelta, más servicios atendidos.",
    puntos: [
      "Toda la flota en un mapa, con el estado de cada unidad al momento.",
      "Despacho desde el mapa o con atajos de teclado, sin ventanas que estorben.",
      "El WhatsApp de la central dentro de la Terminal: los pedidos no se pierden en un celular.",
      "Historial del día y consulta de unidades y choferes en la misma pantalla.",
    ],
    imagen: "/landing/terminal.webp",
    ancho: 1920,
    alto: 1200,
    alt: "Terminal de TaxiHUB con la flota en el mapa de Palenque",
  },
  {
    clave: "choferes",
    nombre: "Choferes",
    titulo: "El servicio llega al celular con todo lo necesario.",
    puntos: [
      "La oferta llega con aviso sonoro y voz, con los datos para decidir rápido.",
      "Datos del cliente, distancia y tiempo estimado sin llamar a la central.",
      "Navegación 3D al punto de recogida y al destino.",
      "Turno con evidencia de combustible y odómetro desde la app.",
    ],
    imagen: "/landing/operador.webp",
    ancho: 780,
    alto: 1688,
    alt: "App del chofer de TaxiHUB con un servicio en curso",
  },
  {
    clave: "socios",
    nombre: "Socios y dueños",
    titulo: "Sus unidades, sus choferes y su dinero, en claro.",
    puntos: [
      "Servicios e ingresos del día por unidad.",
      "Choferes asignados, turnos y cuota diaria.",
      "Mantenimiento y cargas de combustible registradas.",
      "Panel en la web y app Android para revisarlo desde donde estén.",
    ],
    imagen: "/landing/socio.webp",
    ancho: 1920,
    alto: 1200,
    alt: "Panel del socio de TaxiHUB con el resumen del día",
  },
];

export function Beneficios() {
  const reduce = useReducedMotion();
  const [rol, setRol] = useState("central");
  const refs = useRef({});
  const actual = ROLES.find((r) => r.clave === rol);
  const vertical = actual.ancho < actual.alto;

  const onTecla = (e) => {
    const i = ROLES.findIndex((r) => r.clave === rol);
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % ROLES.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + ROLES.length) % ROLES.length;
    if (j == null) return;
    e.preventDefault();
    setRol(ROLES[j].clave);
    refs.current[ROLES[j].clave]?.focus();
  };

  return (
    <section id="beneficios" aria-labelledby="beneficios-titulo" className="ld-seccion">
      <div className="ld-contenedor">
        <Reveal className="max-w-[42rem]">
          <Etiqueta>Para cada parte de tu operación</Etiqueta>
          <h2 id="beneficios-titulo" className="ld-h2 mt-4">Cada quien ve lo que necesita.</h2>
        </Reveal>

        <div role="tablist" aria-label="Elige un rol" className="ld-segmentado mt-10" onKeyDown={onTecla}>
          {ROLES.map((r) => (
            <button
              key={r.clave}
              ref={(el) => { refs.current[r.clave] = el; }}
              role="tab"
              type="button"
              id={`rol-${r.clave}`}
              aria-selected={r.clave === rol}
              aria-controls="panel-rol"
              tabIndex={r.clave === rol ? 0 : -1}
              data-testid={`${LANDING.beneficioTab}-${r.clave}`}
              onClick={() => setRol(r.clave)}
              className="ld-segmento"
            >
              {r.clave === rol && <motion.span layoutId="ld-segmento" className="ld-segmento-fondo" transition={reduce ? { duration: 0 } : T.comp} />}
              <span>{r.nombre}</span>
            </button>
          ))}
        </div>

        <div id="panel-rol" role="tabpanel" aria-labelledby={`rol-${rol}`} className="mt-10">
          <Cambio clave={rol} className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <h3 className="ld-display text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-tight">{actual.titulo}</h3>
                <ul className="ld-lista-check mt-6">
                  {actual.puntos.map((p) => (
                    <li key={p} className="text-[15px] text-[#B7C4D4]">
                      <Check className="mt-0.5 h-5 w-5 text-[#FFE600]" aria-hidden="true" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <figure className={vertical ? "mx-auto w-[min(250px,70vw)]" : ""}>
                <div className={vertical ? "ld-telefono" : "ld-navegador"}>
                  {!vertical && (
                    <div className="ld-navegador-barra" aria-hidden="true">
                      <i /><i /><i />
                    </div>
                  )}
                  <img src={actual.imagen} width={actual.ancho} height={actual.alto} alt={actual.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
                </div>
                <figcaption className="ld-mono mt-3 text-center text-[10.5px] uppercase tracking-[0.12em] text-[#8A9BB0]">Captura real</figcaption>
              </figure>
          </Cambio>
        </div>
      </div>
    </section>
  );
}
