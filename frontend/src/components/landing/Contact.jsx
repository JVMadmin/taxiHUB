import React, { useState } from "react";
import { Send, MessageSquare, PhoneCall, CheckCircle2, ShieldAlert } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Reveal } from "./motion";

// WhatsApp de ventas: wa.me exige solo dígitos con lada de país (México = 52, sin el "1" de celular).
export const WHATSAPP_VENTAS = "529161632304";
export const WHATSAPP_VENTAS_TEXTO = "+52 916 163 2304";

export function abrirWhatsAppVentas(texto) {
  const url = `https://wa.me/${WHATSAPP_VENTAS}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
  // Si el navegador bloquea la ventana nueva (Safari/WebView), abrir en la misma pestaña.
  // Sin "noopener" en features: con él window.open siempre devuelve null.
  const win = window.open(url, "_blank");
  if (win) win.opener = null;
  else window.location.href = url;
}

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
      const payload = {
        ...formData,
        fecha: new Date().toISOString(),
      };
      localStorage.setItem("taxihub_last_lead", JSON.stringify(payload));
      setSubmitted(true);

      abrirWhatsAppVentas(
        `Hola TaxiHUB, soy ${formData.nombre} de la central "${formData.central}". Tenemos aproximadamente ${formData.unidades} unidades. Me interesa la tarifa de $99 MXN por unidad y el pago único de implementación.` +
          (formData.mensaje ? ` Detalle: ${formData.mensaje}` : "") +
          ` Mi teléfono: ${formData.telefono}.`
      );
    } catch (err) {
      setError("Error al procesar la solicitud. Por favor contáctanos por WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contacto" className="py-20 sm:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Columna izquierda: Información comercial */}
          <div className="lg:col-span-5">
            <Reveal>
              <span className="text-[#FFE600] font-mono text-xs font-bold tracking-wider uppercase bg-[#FFE600]/10 px-2.5 py-1 rounded-full border border-[#FFE600]/25">
                Implementación
              </span>
              <h2 className="font-display l-titulo mt-3">
                Te ayudamos a pasar tu central a TaxiHUB.
              </h2>
              <p className="mt-4 text-base text-[#a1a6b2] leading-relaxed">
                Configuramos el mapa de tu ciudad, damos de alta tus unidades y choferes, capacitamos a tus
                operadoras y vinculamos el WhatsApp de la central.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] ">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600]/10 text-[#FFE600] shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Atención por WhatsApp</h4>
                    <p className="text-xs text-[#8b909c] mt-0.5">
                      Escríbenos al {WHATSAPP_VENTAS_TEXTO}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] ">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600]/10 text-[#FFE600] shrink-0">
                    <PhoneCall className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Prueba con tu ciudad</h4>
                    <p className="text-xs text-[#8b909c] mt-0.5">
                      Montamos una prueba con tus colonias y puntos frecuentes.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Columna derecha: Formulario diurno */}
          <div className="lg:col-span-7">
            <Reveal delay={0.1}>
              <div className="p-7 sm:p-9 rounded-3xl bg-white/[0.03] border border-white/10 ">
                <h3 className="text-2xl font-extrabold text-white mb-2">Pide tu demostración</h3>
                <p className="text-xs text-[#8b909c] mb-6 font-mono">
                  Tarifa oficial: $99 MXN / mes por unidad activa + pago único de configuración inicial.
                </p>

                {submitted ? (
                  <div
                    data-testid={LANDING.leadSuccess}
                    className="p-6 rounded-2xl bg-[#FFE600]/10 border border-[#FFE600]/25 text-center"
                  >
                    <CheckCircle2 className="w-12 h-12 text-[#FFE600] mx-auto mb-3" />
                    <h4 className="text-lg font-bold text-white mb-1">¡Listo!</h4>
                    <p className="text-sm text-[#a1a6b2] mb-4">
                      Abrimos WhatsApp con tu mensaje listo para enviar.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-white hover:bg-white/15 transition"
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
                        className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs font-medium"
                      >
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#d4d7de] mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/15 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#FFE600] focus:ring-2 focus:ring-[#FFE600]/20 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#d4d7de] mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/15 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#FFE600] focus:ring-2 focus:ring-[#FFE600]/20 transition"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#d4d7de] mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/15 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#FFE600] focus:ring-2 focus:ring-[#FFE600]/20 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#d4d7de] mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/15 text-sm text-white focus:outline-none focus:border-[#FFE600] focus:ring-2 focus:ring-[#FFE600]/20 transition font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#d4d7de] mb-1">
                        Mensaje o requerimientos especiales
                      </label>
                      <textarea
                        name="mensaje"
                        rows="3"
                        value={formData.mensaje}
                        onChange={handleChange}
                        data-testid={LANDING.leadMensaje}
                        placeholder="Cuéntanos sobre tu ciudad o si requieren migrar desde radios analógicos..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/15 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#FFE600] focus:ring-2 focus:ring-[#FFE600]/20 transition resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      data-testid={LANDING.leadSubmit}
                      className="w-full mt-2 py-3.5 px-6 rounded-xl bg-[#FFE600] hover:bg-[#FFB800] text-[#0C0E14] font-bold text-sm flex items-center justify-center gap-2  transition disabled:opacity-50 active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      <span>{submitting ? "Enviando..." : "Enviar por WhatsApp"}</span>
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
