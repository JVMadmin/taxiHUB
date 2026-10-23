import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Radio, Navigation, MessageCircle, Smartphone, LayoutDashboard } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { MapaDemo } from "./demo/MapaDemo";
import { HojaDespacho } from "./demo/HojaDespacho";
import { HojaSeguimiento } from "./demo/HojaSeguimiento";
import { ChatWhatsApp } from "./demo/ChatWhatsApp";
import { CapturaGuiada } from "./demo/CapturaGuiada";
import { useServicio } from "./demo/useFlota";
import { Cambio, Etiqueta, Reveal, T, useEnVista, useMediaQuery } from "./motion";

export const PESTANAS = [
  { clave: "despacho", icono: Radio, titulo: "Despacho", texto: "Recibe un pedido y ofrécelo a la unidad libre más cercana." },
  { clave: "seguimiento", icono: Navigation, titulo: "Seguimiento", texto: "Velocidad, rumbo y recorrido de cada unidad, en vivo." },
  { clave: "whatsapp", icono: MessageCircle, titulo: "WhatsApp de la central", texto: "Los pedidos por WhatsApp llegan a la Terminal y se confirman solos." },
  { clave: "chofer", icono: Smartphone, titulo: "App del chofer", texto: "Oferta con aviso, navegación 3D y cierre del viaje." },
  { clave: "socio", icono: LayoutDashboard, titulo: "Panel del socio", texto: "Servicios, flota e ingresos del día de sus unidades." },
];
const CON_MAPA = ["despacho", "seguimiento"];
// La hoja lateral tapa 332 px del mapa en escritorio.
const RELLENO_HOJA = { top: 40, right: 340, bottom: 20, left: 20 };
const RELLENO_MOVIL = { top: 40, right: 20, bottom: 20, left: 20 };

const PUNTOS_CHOFER = [
  { clave: "turno", x: 76, y: 7.5, titulo: "Turno y GPS a la vista", texto: "Nombre, unidad, tiempo de turno y estado del GPS. La ubicación se sigue enviando con la pantalla apagada." },
  { clave: "mapa3d", x: 87.5, y: 24.5, titulo: "Navegación 3D", texto: "Mapa con edificios en relieve que sigue al taxi y gira con su rumbo, con la ruta al cliente." },
  { clave: "cliente", x: 12.5, y: 59.5, titulo: "Datos del servicio", texto: "Cliente, punto de recogida, distancia, tiempo estimado y forma de pago, sin llamar a la central." },
  { clave: "llegue", x: 90, y: 85.6, titulo: "Un botón por paso", texto: "Avisar que ya llegó, iniciar y terminar el viaje. Cada paso actualiza la Terminal al instante." },
  { clave: "chat", x: 73, y: 93, titulo: "Chat y reportes", texto: "Chat con el cliente y reporte de incidencias u objetos olvidados desde la misma pantalla." },
];
const PUNTOS_SOCIO = [
  { clave: "estado", x: 19.9, y: 15.3, titulo: "Estado general del día", texto: "Un resumen claro: cuántas unidades trabajan y cómo van los servicios de hoy." },
  { clave: "servicios", x: 40.8, y: 30.2, titulo: "Servicios de hoy", texto: "Servicios, completados y cancelados de sus unidades, al día." },
  { clave: "flota", x: 54.7, y: 45.2, titulo: "Su flota en vivo", texto: "Unidades disponibles, ocupadas y fuera de servicio, y choferes activos." },
  { clave: "ingresos", x: 54.7, y: 56.3, titulo: "Ingresos de hoy", texto: "Lo que generaron sus unidades en el día, para liquidar cuotas sin cuentas a mano." },
  { clave: "zonas", x: 89.6, y: 69.2, titulo: "Demanda por zona", texto: "Dónde se concentran los servicios por colonia, para decidir dónde poner unidades." },
  { clave: "menu", x: 12.8, y: 30, titulo: "Mantenimiento y combustible", texto: "Desde el menú: choferes, turnos, mantenimiento, cargas de combustible, mapa y reportes." },
];

function Pestanas({ pestana, setPestana, vertical }) {
  const reduce = useReducedMotion();
  const refs = useRef({});
  const onTecla = (e) => {
    const i = PESTANAS.findIndex((p) => p.clave === pestana);
    const atras = vertical ? "ArrowUp" : "ArrowLeft";
    const adelante = vertical ? "ArrowDown" : "ArrowRight";
    let j = null;
    if (e.key === adelante) j = (i + 1) % PESTANAS.length;
    else if (e.key === atras) j = (i - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = PESTANAS.length - 1;
    if (j == null) return;
    e.preventDefault();
    setPestana(PESTANAS[j].clave);
    refs.current[PESTANAS[j].clave]?.focus();
  };

  return (
    <div role="tablist" aria-label="Partes del producto" aria-orientation={vertical ? "vertical" : "horizontal"} className={vertical ? "ld-tabs-v" : "ld-tabs-h"} onKeyDown={onTecla}>
      {PESTANAS.map(({ clave, icono: Icono, titulo, texto }) => {
        const sel = clave === pestana;
        return (
          <button
            key={clave}
            ref={(el) => { refs.current[clave] = el; }}
            id={`tab-${clave}`}
            role="tab"
            type="button"
            aria-selected={sel}
            aria-controls="panel-producto"
            tabIndex={sel ? 0 : -1}
            data-testid={`${LANDING.explorTab}-${clave}`}
            onClick={() => setPestana(clave)}
            className={vertical ? "ld-tab-v isolate" : "ld-tab-h"}
          >
            {vertical ? (
              <>
                {sel && <motion.span layoutId="ld-tab-fondo" className="ld-tab-v-fondo" transition={reduce ? { duration: 0 } : T.comp} />}
                {sel && <motion.span layoutId="ld-tab-barra" className="ld-tab-v-barra" transition={reduce ? { duration: 0 } : T.comp} />}
                <span className="ld-tab-v-icono" aria-hidden="true"><Icono className="h-[18px] w-[18px]" /></span>
                <span>
                  <span className="block text-[15px] font-semibold">{titulo}</span>
                  <small>{texto}</small>
                </span>
              </>
            ) : (
              <>
                <Icono className="h-4 w-4" aria-hidden="true" />
                {titulo}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Explorador({ pestana, setPestana }) {
  const escritorio = useMediaQuery("(min-width: 1024px)");
  const tablaAncha = useMediaQuery("(min-width: 768px)");
  const marcoRef = useRef(null);
  // El mapa del explorador se crea al acercarse a la sección (no compite con el del hero al cargar).
  const cerca = useEnVista(marcoRef, "500px");
  const [montarMapa, setMontarMapa] = useState(false);
  useEffect(() => {
    if (cerca) setMontarMapa(true);
  }, [cerca]);

  const [selSeg, setSelSeg] = useState("054");
  const [seguir, setSeguir] = useState(true);
  const servicio = useServicio();
  const selDespacho = servicio.unidadId || servicio.candidatos[servicio.idx]?.id || null;
  const conMapa = CON_MAPA.includes(pestana);
  const actual = PESTANAS.find((p) => p.clave === pestana);

  return (
    <section id="producto" aria-labelledby="producto-titulo" className="ld-seccion" data-testid={LANDING.explorador}>
      <div className="ld-contenedor">
        <Reveal className="max-w-[44rem]">
          <Etiqueta>Explora el producto</Etiqueta>
          <h2 id="producto-titulo" className="ld-h2 mt-4">
            Toda tu operación <span className="ld-amarillo">en un solo lugar.</span>
          </h2>
          <p className="ld-lead mt-5">
            Prueba el despacho, sigue una unidad o mira cómo entra un pedido por WhatsApp. Las vistas de mapa son
            interactivas; las de las apps son capturas reales.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
          {escritorio ? <Pestanas pestana={pestana} setPestana={setPestana} vertical /> : <Pestanas pestana={pestana} setPestana={setPestana} />}

          <div ref={marcoRef} id="panel-producto" role="tabpanel" aria-labelledby={`tab-${pestana}`} aria-label={actual?.titulo} className="ld-marco-demo">
            {/* El mapa queda montado aunque se cambie de pestaña: conserva la vista y no se
                recrea (destruirlo mientras carga el estilo dejaba un AbortError de MapLibre). */}
            {montarMapa && (
              <div className={conMapa ? "absolute inset-0 max-md:relative max-md:h-[340px]" : "hidden"}>
                <MapaDemo
                    seleccionId={pestana === "despacho" ? selDespacho : selSeg}
                    onSeleccionar={(id) => {
                      if (pestana === "seguimiento") setSelSeg(id);
                    }}
                    mostrarServicio={pestana === "despacho"}
                    mostrarRastro={pestana === "seguimiento"}
                    seguir={pestana === "seguimiento" && seguir}
                    onDejarDeSeguir={() => setSeguir(false)}
                    vista={{ zoom: 14.6, pitch: 30, bearing: -8 }}
                    relleno={tablaAncha ? RELLENO_HOJA : RELLENO_MOVIL}
                    etiqueta={pestana === "despacho" ? "Mapa del despacho de demostración" : "Mapa de seguimiento de unidades de demostración"}
                  />
              </div>
            )}
            <Cambio clave={pestana} className={conMapa ? "pointer-events-none md:absolute md:inset-0" : "h-full"}>
                {pestana === "despacho" && <HojaDespacho />}
                {pestana === "seguimiento" && (
                  <HojaSeguimiento
                    sel={selSeg}
                    onSel={(id) => {
                      setSelSeg(id);
                      setSeguir(true);
                    }}
                    seguir={seguir}
                    onSeguir={setSeguir}
                  />
                )}
                {pestana === "whatsapp" && <ChatWhatsApp />}
                {pestana === "chofer" && (
                  <CapturaGuiada
                    variante="telefono"
                    imagen="/landing/operador.webp"
                    ancho={780}
                    alto={1688}
                    alt="App del chofer de TaxiHUB con un servicio asignado y el mapa 3D"
                    puntos={PUNTOS_CHOFER}
                  />
                )}
                {pestana === "socio" && (
                  <CapturaGuiada
                    variante="navegador"
                    imagen="/landing/socio.webp"
                    ancho={1920}
                    alto={1200}
                    alt="Panel del socio de TaxiHUB con el estado de la flota y los servicios del día"
                    puntos={PUNTOS_SOCIO}
                    url="taxihub.cloud/dueno"
                  />
                )}
            </Cambio>
          </div>
        </div>
      </div>
    </section>
  );
}
