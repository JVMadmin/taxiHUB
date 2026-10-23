import React, { useState } from "react";
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
      const payload = {
        ...formData,
        fecha: new Date().toISOString(),
      };
      localStorage.setItem("taxihub_last_lead", JSON.stringify(payload));
      setSubmitted(true);

      const msg = encodeURIComponent(
        `Hola TaxiHUB, soy ${formData.nombre} de la central "${formData.central}". Tenemos aproximadamente ${formData.unidades} unidades. Me interesa la tarifa de $99 MXN por unidad y el pago único de implementación.` +
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
    <section id="contacto" className="border-t border-slate-200/80 bg-slate-50/60 py-20 sm:py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Columna izquierda: Información comercial */}
          <div className="lg:col-span-5">
            <Reveal>
              <span className="text-amber-800 font-mono text-xs font-bold tracking-wider uppercase bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                Implementación e Informes
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
                Migra tu central en menos de 48 horas.
              </h2>
              <p className="mt-4 text-base text-slate-600 leading-relaxed">
                Nuestros ingenieros configuran el mapa de tu ciudad, capacitan a tus operadoras
                y enlazan tu línea oficial de WhatsApp sin cobro por mensaje.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Atención Directa por WhatsApp</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Respuesta inmediata al +52 916 100 9999
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 shrink-0">
                    <PhoneCall className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Demostración en tu Ciudad</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Montamos una prueba piloto con tus colonias y sitios reales.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Columna derecha: Formulario diurno */}
          <div className="lg:col-span-7">
            <Reveal delay={0.1}>
              <div className="p-7 sm:p-9 rounded-3xl bg-white border border-slate-200/90 shadow-2xl">
                <h3 className="text-2xl font-extrabold text-slate-900 mb-2">Solicitar Demostración y Cotización</h3>
                <p className="text-xs text-slate-500 mb-6 font-mono">
                  Tarifa oficial: $99 MXN / mes por unidad activa + pago único de configuración inicial.
                </p>

                {submitted ? (
                  <div
                    data-testid={LANDING.leadSuccess}
                    className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center"
                  >
                    <CheckCircle2 className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    <h4 className="text-lg font-bold text-slate-900 mb-1">¡Solicitud generada con éxito!</h4>
                    <p className="text-sm text-slate-600 mb-4">
                      Se ha abierto tu conversación de WhatsApp con la cotización prellenada.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition"
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
                        className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium"
                      >
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 transition"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 transition font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mensaje o requerimientos especiales
                      </label>
                      <textarea
                        name="mensaje"
                        rows="3"
                        value={formData.mensaje}
                        onChange={handleChange}
                        data-testid={LANDING.leadMensaje}
                        placeholder="Cuéntanos sobre tu ciudad o si requieren migrar desde radios analógicos..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 transition resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      data-testid={LANDING.leadSubmit}
                      className="w-full mt-2 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-400/25 transition disabled:opacity-50 active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      <span>{submitting ? "Enviando..." : "Solicitar Cotización y Abrir WhatsApp"}</span>
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
