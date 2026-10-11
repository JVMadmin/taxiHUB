import React, { useState } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, PhoneCall, CheckCircle2, ShieldAlert } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Reveal } from "./motion";

export function Contact() {
  const [formData, setFormData] = useState({
    nombre: "",
    central: "",
    telefono: "",
    unidades: "15",
    mensaje: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.central.trim() || !formData.telefono.trim()) {
      setError("Por favor completa tu nombre, central y teléfono para contactarte.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      // Registrar lead localmente y abrir canal WhatsApp
      const payload = {
        ...formData,
        fecha: new Date().toISOString(),
      };
      localStorage.setItem("taxihub_last_lead", JSON.stringify(payload));
      setSubmitted(true);

      const msg = encodeURIComponent(
        `Hola TaxiHUB, soy ${formData.nombre} de la central "${formData.central}". Tenemos aproximadamente ${formData.unidades} unidades. Me interesa la cotización de $99 MXN por unidad y el pago único de implementación.` +
          (formData.mensaje ? ` Detalle: ${formData.mensaje}` : "")
      );
      window.open(`https://wa.me/529161009999?text=${msg}`, "_blank");
    } catch (err) {
      setError("Error al procesar la solicitud. Por favor contáctanos por WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contacto" className="py-24 border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Columna izquierda: Información comercial */}
          <div className="lg:col-span-5">
            <Reveal>
              <span className="text-emerald-400 font-mono text-xs font-semibold tracking-wider uppercase">
                Implementación e Informes
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
                Migra tu central en menos de 48 horas.
              </h2>
              <p className="mt-4 text-base text-zinc-400 leading-relaxed">
                Nuestros ingenieros capacitan a tus despachadoras, configuran tu mapa de sitios
                locales y enlazan tu número de WhatsApp oficial sin comisiones por mensaje.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <MessageSquare className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-white">Soporte y Ventas Directas</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Atención inmediata vía WhatsApp al +52 916 100 9999
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <PhoneCall className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-white">Prueba Piloto en Vivo</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Demostración guiada con simulación de viajes en tu propia ciudad.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Columna derecha: Formulario */}
          <div className="lg:col-span-7">
            <Reveal delay={0.1}>
              <div className="p-8 sm:p-10 rounded-2xl bg-zinc-900/60 border border-white/[0.08] backdrop-blur-xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                <h3 className="text-xl font-bold text-white mb-2">Solicitar Demostración y Cotización</h3>
                <p className="text-xs text-zinc-400 mb-6 font-mono">
                  Tarifa: $99 MXN / mes por unidad activa + pago único de configuración inicial.
                </p>

                {submitted ? (
                  <div
                    data-testid={LANDING.leadSuccess}
                    className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center"
                  >
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <h4 className="text-lg font-bold text-white mb-1">¡Solicitud recibida!</h4>
                    <p className="text-sm text-zinc-300 mb-4">
                      Se ha generado tu ficha de contacto. Se abrió la conversación de WhatsApp oficial con tu cotización prellenada.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="px-4 py-2 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
                    >
                      Enviar otra consulta
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmit}
                    data-testid={LANDING.leadForm}
                    className="space-y-4"
                  >
                    {error && (
                      <div
                        data-testid={LANDING.leadError}
                        className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium"
                      >
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Tu Nombre Completo *
                        </label>
                        <input
                          type="text"
                          name="nombre"
                          required
                          value={formData.nombre}
                          onChange={handleChange}
                          data-testid={LANDING.leadNombre}
                          placeholder="Ej. Roberto Méndez"
                          className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Nombre de la Central o Sitio *
                        </label>
                        <input
                          type="text"
                          name="central"
                          required
                          value={formData.central}
                          onChange={handleChange}
                          data-testid={LANDING.leadCentral}
                          placeholder="Ej. Radio Taxis Maya"
                          className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Teléfono o WhatsApp *
                        </label>
                        <input
                          type="tel"
                          name="telefono"
                          required
                          value={formData.telefono}
                          onChange={handleChange}
                          data-testid={LANDING.leadTelefono}
                          placeholder="Ej. 916 123 4567"
                          className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Número estimado de unidades
                        </label>
                        <input
                          type="number"
                          name="unidades"
                          min="1"
                          max="1000"
                          value={formData.unidades}
                          onChange={handleChange}
                          data-testid={LANDING.leadUnidades}
                          className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        Mensaje o requerimientos especiales
                      </label>
                      <textarea
                        name="mensaje"
                        rows="3"
                        value={formData.mensaje}
                        onChange={handleChange}
                        data-testid={LANDING.leadMensaje}
                        placeholder="Cuéntanos sobre tu ciudad, si ya usan WhatsApp o si requieren migrar desde radios analógicos..."
                        className="w-full px-3.5 py-2.5 rounded-lg bg-black/50 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      data-testid={LANDING.leadSubmit}
                      className="w-full mt-2 py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{submitting ? "Enviando..." : "Solicitar Cotización y Enlace WhatsApp"}</span>
                    </button>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
