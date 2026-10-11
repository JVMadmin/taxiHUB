import React from "react";
import { Link } from "react-router-dom";
import { Radio, Shield, Code, ChevronRight, Download } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import { LANDING } from "@/constants/testIds";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.08] bg-black/60 backdrop-blur-xl py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Marca */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <BrandMark className="w-8 h-8 rounded-lg shadow-md shadow-emerald-500/10" />
              <BrandWordmark className="text-xl" />
            </div>
            <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
              Plataforma de alta disponibilidad para despacho operativo de flotas y radio taxis.
              Despacho en 1 clic, bridge de WhatsApp QR con $0 costo por mensaje y aplicaciones
              nativas para Windows y Android.
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Infraestructura Activa &bull; taxihub.cloud</span>
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
                  to="/terminal/login"
                  data-testid={LANDING.footerOperadora}
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Central de Despacho</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  data-testid={LANDING.footerOperador}
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>App Operador Web</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/dueno/login"
                  data-testid={LANDING.footerDueno}
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Portal de Socios / Concesionarios</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/dev"
                  data-testid={LANDING.footerDev}
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                >
                  <Code className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Panel de Desarrollador</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Descargas Nativas */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">
              Descargas Nativas
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="/downloads/TaxiHub-Central.exe"
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Terminal Windows (.exe)</span>
                </a>
              </li>
              <li>
                <a
                  href="/downloads/taxiHUB-operador-debug.apk"
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Operador Android (.apk)</span>
                </a>
              </li>
              <li>
                <a
                  href="/downloads/taxiHUB-socio-debug.apk"
                  className="text-zinc-400 hover:text-emerald-400 transition flex items-center gap-1.5"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Socio Android (.apk)</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Modelo Comercial */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 font-mono">
              Propuesta TaxiHUB
            </h4>
            <div className="space-y-3 text-xs text-zinc-400">
              <p>
                <strong className="text-white font-mono">$99 MXN / mes</strong> por unidad activa.
              </p>
              <p>
                Pago único de implementación que incluye carga de mapa local, capacitación de despachadoras y configuración del puente WhatsApp.
              </p>
              <p className="text-emerald-400/90 font-mono">
                Cero comisiones ocultas &bull; WhatsApp QR directo sin API paga.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            &copy; {currentYear} TaxiHUB. Todos los derechos reservados. Desarrollado para centrales y cooperativas de radio taxi.
          </p>
          <div className="flex items-center gap-6">
            <a href="#inicio" className="hover:text-zinc-300 transition">Inicio</a>
            <a href="#simulador" className="hover:text-zinc-300 transition">Simulador</a>
            <a href="#precios" className="hover:text-zinc-300 transition">Precios</a>
            <a href="#contacto" className="hover:text-zinc-300 transition">Contacto</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
