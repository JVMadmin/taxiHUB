import { Link } from "react-router-dom";
import { BrandMark } from "@/components/Brand";
import { LANDING } from "@/constants/testIds";
import { WHATSAPP_VENTAS_TEXTO, abrirWhatsAppVentas } from "./Contact";

const PORTALES = [
  { to: "/terminal/login", texto: "Terminal de despacho", tid: LANDING.footerOperadora },
  { to: "/operador", texto: "App del chofer" },
  { to: "/pasajero", texto: "App del pasajero" },
  { to: "/dueno/login", texto: "Panel del socio", tid: LANDING.footerDueno },
  { to: "/dev", texto: "Panel de desarrollador", tid: LANDING.footerDev },
];

export function Footer() {
  const anio = new Date().getFullYear();
  return (
    <footer className="border-t border-[rgba(148,172,204,0.12)] bg-[#03070C] pb-10 pt-16">
      <div className="ld-contenedor">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size="sm" />
              <span className="ld-display text-[1.2rem] font-extrabold tracking-tight">
                taxi<span className="ld-amarillo">HUB</span>
              </span>
            </div>
            <p className="ld-mono mt-2 text-[10.5px] uppercase tracking-[0.16em] text-[#8A9BB0]">Central y despacho satelital</p>
            <p className="ld-cuerpo mt-5 max-w-[26rem] text-[14px]">
              Software de despacho para sitios y cooperativas de radio taxi: flota en vivo, asignación por cercanía,
              app del chofer con navegación 3D, WhatsApp de la central y control para socios.
            </p>
          </div>

          <nav aria-label="Portales">
            <h4 className="ld-mono text-[11px] uppercase tracking-[0.14em] text-[#B7C4D4]">Portales</h4>
            <ul className="mt-4 grid gap-1">
              {PORTALES.map((p) => (
                <li key={p.to}>
                  <Link to={p.to} data-testid={p.tid} className="inline-flex min-h-[36px] items-center text-[14px] text-[#8A9BB0] transition-colors hover:text-[#FFE600]">
                    {p.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h4 className="ld-mono text-[11px] uppercase tracking-[0.14em] text-[#B7C4D4]">Contacto</h4>
            <ul className="mt-4 grid gap-1 text-[14px] text-[#8A9BB0]">
              <li>
                <button type="button" onClick={() => abrirWhatsAppVentas()} className="inline-flex min-h-[36px] items-center transition-colors hover:text-[#FFE600]">
                  WhatsApp {WHATSAPP_VENTAS_TEXTO}
                </button>
              </li>
              <li className="flex min-h-[36px] items-center">Palenque, Chiapas, México</li>
              <li className="flex min-h-[36px] items-center">$99 MXN / mes por unidad activa</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[rgba(148,172,204,0.1)] pt-6 text-[12.5px] text-[#6F829A] sm:flex-row sm:items-center sm:justify-between">
          <span>© {anio} TaxiHUB · taxihub.cloud</span>
          <span>Mapas: © OpenStreetMap · OpenFreeMap. Unidades del mapa de la página: datos de demostración.</span>
        </div>
      </div>
    </footer>
  );
}
