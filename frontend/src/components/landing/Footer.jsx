import React from "react";
import { Link } from "react-router-dom";
import { Radio, Shield, Code, MapPin, Phone, Car, User } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { LANDING } from "@/constants/testIds";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.08] bg-[#030405] py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Marca */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <BrandMark className="w-8 h-8 rounded-lg shadow-sm" />
              <BrandWordmark className="text-xl" />
            </div>
            <p className="text-sm text-[#a1a6b2] max-w-sm leading-relaxed">
              Software de despacho para sitios y cooperativas de radio taxi: flota en vivo, asignación por GPS,
              app del chofer con navegación 3D, WhatsApp de la central y control de cuotas para dueños.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#8b909c] font-mono">
              <span className="w-2 h-2 rounded-full bg-[#FFE600] animate-pulse" />
              <span>taxihub.cloud</span>
            </div>
          </div>

          {/* Accesos Rápidos Operativos */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">
              Portales Operativos
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  to="/pasajero"
                  className="text-[#a1a6b2] hover:text-[#FFE600] transition flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5 text-[#FFE600]" />
                  <span>App Pasajero / Cliente</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/operador"
                  className="text-[#a1a6b2] hover:text-[#FFE600] transition flex items-center gap-1.5"
                >
                  <Car className="w-3.5 h-3.5 text-[#FFE600]" />
                  <span>App Conductor / Operador</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/terminal/login"
                  data-testid={LANDING.footerOperadora}
                  className="text-[#a1a6b2] hover:text-[#FFE600] transition flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5 text-[#FFE600]" />
                  <span>Central de Despacho</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/dueno/login"
                  data-testid={LANDING.footerDueno}
                  className="text-[#a1a6b2] hover:text-[#FFE600] transition flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-[#FFE600]" />
                  <span>Portal Socios / Flota</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/dev"
                  data-testid={LANDING.footerDev}
                  className="text-[#a1a6b2] hover:text-[#FFE600] transition flex items-center gap-1.5"
                >
                  <Code className="w-3.5 h-3.5 text-[#FFE600]" />
                  <span>Panel de Desarrollador</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Modelo Comercial */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">
              Propuesta Comercial
            </h4>
            <div className="space-y-2.5 text-xs text-[#a1a6b2]">
              <p>
                <strong className="text-white font-mono text-sm">$99 MXN / mes</strong> por unidad activa.
              </p>
              <p>
                Pago único de configuración inicial con mapa local y capacitación completa.
              </p>
              <p className="text-[#FFE600] font-bold">
                Sin comisiones por viaje.
              </p>
            </div>
          </div>

          {/* Cobertura y Contacto */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">
              Contacto y Cobertura
            </h4>
            <div className="space-y-2.5 text-xs text-[#a1a6b2]">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#FFE600] shrink-0" />
                <span>Palenque, Chiapas, México</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#FFE600] shrink-0" />
                <span>Atención a Sitios y Cooperativas</span>
              </div>
              <p className="pt-1">
                Implementación e inducción presencial o remota para su equipo operativo.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8b909c]">
          <p>
            &copy; {currentYear} TaxiHUB. Todos los derechos reservados. Desarrollado para centrales y cooperativas de radio taxi.
          </p>
          <div className="flex items-center gap-6">
            <a href="#inicio" className="hover:text-white transition">Inicio</a>
            <a href="#simulador" className="hover:text-white transition">Simulador</a>
            <a href="#precio" className="hover:text-white transition">Precios</a>
            <a href="#contacto" className="hover:text-white transition">Contacto</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
