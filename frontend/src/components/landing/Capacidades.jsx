import { MapPin, MessageCircle, Navigation, LayoutDashboard, ArrowRight } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Etiqueta, Reveal } from "./motion";

// Cada capacidad abre su demostración en el explorador (sección "Producto").
const CAPACIDADES = [
  {
    clave: "despacho",
    icono: MapPin,
    titulo: "Despacho en tiempo real",
    texto: "Ubica el pedido en el mapa y ofrécelo a la unidad libre más cercana. Si no responde, pasa a la siguiente.",
    dato: "oferta → 1 chofer a la vez",
  },
  {
    clave: "whatsapp",
    icono: MessageCircle,
    titulo: "Comunicación directa",
    texto: "El WhatsApp de la central dentro de la Terminal, chat con el chofer y la app del pasajero.",
    dato: "WhatsApp vinculado por QR",
  },
  {
    clave: "seguimiento",
    icono: Navigation,
    titulo: "Seguimiento GPS",
    texto: "Cada unidad en el mapa con su estado, velocidad y recorrido, actualizado en vivo.",
    dato: "estado · velocidad · rastro",
  },
  {
    clave: "socio",
    icono: LayoutDashboard,
    titulo: "Control para socios",
    texto: "Servicios e ingresos del día, choferes, mantenimiento y combustible de cada unidad.",
    dato: "panel web y app Android",
  },
];

export function Capacidades({ onExplorar }) {
  return (
    <section id="funciones" aria-labelledby="funciones-titulo" className="ld-seccion">
      <div className="ld-contenedor">
        <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <Etiqueta>Lo esencial de la operación</Etiqueta>
            <h2 id="funciones-titulo" className="ld-h2 mt-4 max-w-[18ch]">
              Cuatro cosas que tu central hace todo el día.
            </h2>
          </div>
          <p className="ld-lead max-w-[36rem] lg:justify-self-end">
            TaxiHUB no es un mapa con botones: es el flujo completo del sitio, desde que entra el pedido hasta que el
            socio revisa el día. Elige una para verla funcionando.
          </p>
        </Reveal>

        <div className="ld-capacidades mt-14">
          {CAPACIDADES.map(({ clave, icono: Icono, titulo, texto, dato }) => (
            <button
              key={clave}
              type="button"
              data-testid={`${LANDING.capacidad}-${clave}`}
              onClick={() => onExplorar(clave)}
              className="ld-capacidad group"
              aria-label={`${titulo}: ver la demostración`}
            >
              <span className="ld-capacidad-icono" aria-hidden="true">
                <Icono className="h-5 w-5" />
              </span>
              <span className="ld-h3 mt-2 block">{titulo}</span>
              <span className="ld-cuerpo block">{texto}</span>
              <span className="ld-capacidad-dato mt-1">{dato}</span>
              <span className="ld-enlace mt-auto">
                Ver en la demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
