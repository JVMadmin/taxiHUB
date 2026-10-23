import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Send, MessageCircle, MapPinned, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Cambio, Etiqueta, Reveal } from "./motion";

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

const Campo = ({ etiqueta, id, ...props }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#B7C4D4]">{etiqueta}</label>
    <input id={id} className="ld-campo" {...props} />
  </div>
);

export function Contact() {
  const reduce = useReducedMotion();
  const [formData, setFormData] = useState({ nombre: "", central: "", telefono: "", unidades: "15", mensaje: "" });
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const enviar = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.central.trim() || !formData.telefono.trim()) {
      setError("Completa tu nombre, el de tu central y un teléfono para contactarte.");
      return;
    }
    setError("");
    try {
      localStorage.setItem("taxihub_last_lead", JSON.stringify({ ...formData, fecha: new Date().toISOString() }));
    } catch (_) {
      /* sin almacenamiento: el mensaje de WhatsApp lleva todo */
    }
    setEnviado(true);
    abrirWhatsAppVentas(
      `Hola TaxiHUB, soy ${formData.nombre} de la central "${formData.central}". Tenemos aproximadamente ${formData.unidades} unidades. Me interesa la tarifa de $99 MXN por unidad y el pago único de implementación.` +
        (formData.mensaje ? ` Detalle: ${formData.mensaje}` : "") +
        ` Mi teléfono: ${formData.telefono}.`
    );
  };

  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="ld-seccion">
      <div className="ld-contenedor grid items-start gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Reveal>
          <Etiqueta>Empieza con tu central</Etiqueta>
          <h2 id="contacto-titulo" className="ld-h2 mt-4">
            Lleva tu central a <span className="ld-amarillo">TaxiHUB.</span>
          </h2>
          <p className="ld-lead mt-5 max-w-[32rem]">
            Te mostramos el sistema con tu ciudad: configuramos el mapa, damos de alta tus unidades, capacitamos a tus
            operadoras y vinculamos el WhatsApp de la central.
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              onClick={() => abrirWhatsAppVentas("Hola TaxiHUB, quiero una demostración para mi central de taxis.")}
              className="group flex items-center gap-4 rounded-2xl border border-[rgba(148,172,204,0.14)] bg-[#0A121D] p-4 text-left transition-colors hover:border-[#FFE600]/45"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#22C55E]/10 text-[#4ADE80]" aria-hidden="true">
                <MessageCircle className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Escríbenos por WhatsApp</span>
                <span className="ld-mono block text-[13px] text-[#8A9BB0]">{WHATSAPP_VENTAS_TEXTO}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-[#8A9BB0] transition-transform group-hover:translate-x-1 group-hover:text-[#FFE600]" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-4 rounded-2xl border border-[rgba(148,172,204,0.14)] p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#FFE600]/10 text-[#FFE600]" aria-hidden="true">
                <MapPinned className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">Prueba con tu ciudad</span>
                <span className="block text-[13px] text-[#8A9BB0]">Montamos la demostración con tus colonias y puntos frecuentes.</span>
              </span>
            </div>
          </div>
        </Reveal>

        <div className="ld-panel p-6 sm:p-8">
          <h3 className="ld-display text-[1.5rem] font-extrabold">Pide tu demostración</h3>
          <p className="ld-mono mt-1.5 text-[12px] text-[#8A9BB0]">$99 MXN / mes por unidad activa + implementación única</p>

          {enviado ? (
              <Cambio clave="ok" data-testid={LANDING.leadSuccess} className="mt-6 rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/[0.07] p-6 text-center" role="status">
                <CheckCircle2 className="mx-auto h-10 w-10 text-[#22C55E]" aria-hidden="true" />
                <h4 className="mt-3 text-[17px] font-semibold">Listo</h4>
                <p className="mt-1 text-[14px] text-[#B7C4D4]">Abrimos WhatsApp con tu mensaje listo para enviar.</p>
                <button type="button" onClick={() => setEnviado(false)} className="ld-btn ld-btn--secundario ld-btn--chico mt-5">
                  Enviar otra consulta
                </button>
              </Cambio>
            ) : (
              <Cambio as="form" clave="form" onSubmit={enviar} data-testid={LANDING.leadForm} className="mt-6 grid gap-4" noValidate>
                <AnimatePresence initial={false}>
                  {error && (
                    <motion.div
                      initial={reduce ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      data-testid={LANDING.leadError}
                      role="alert"
                      className="flex items-center gap-2 rounded-xl border border-[#F4544C]/35 bg-[#F4544C]/10 p-3 text-[13px] text-[#FFC9C5]"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Tu nombre *" id="lead-nombre" name="nombre" autoComplete="name" value={formData.nombre} onChange={cambiar} data-testid={LANDING.leadNombre} placeholder="Ej. Roberto Méndez" required />
                  <Campo etiqueta="Central o sitio *" id="lead-central" name="central" autoComplete="organization" value={formData.central} onChange={cambiar} data-testid={LANDING.leadCentral} placeholder="Ej. Radio Taxis Maya" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Teléfono o WhatsApp *" id="lead-telefono" name="telefono" type="tel" autoComplete="tel" value={formData.telefono} onChange={cambiar} data-testid={LANDING.leadTelefono} placeholder="Ej. 916 123 4567" required />
                  <Campo etiqueta="Unidades (aprox.)" id="lead-unidades" name="unidades" type="number" inputMode="numeric" min="1" max="1000" value={formData.unidades} onChange={cambiar} data-testid={LANDING.leadUnidades} className="ld-campo ld-mono" />
                </div>
                <div>
                  <label htmlFor="lead-mensaje" className="mb-1.5 block text-[13px] font-medium text-[#B7C4D4]">Cuéntanos de tu operación</label>
                  <textarea
                    id="lead-mensaje"
                    name="mensaje"
                    rows={3}
                    value={formData.mensaje}
                    onChange={cambiar}
                    data-testid={LANDING.leadMensaje}
                    placeholder="Ciudad, cuántas operadoras tienen, si hoy despachan por radio…"
                    className="ld-campo resize-none"
                  />
                </div>
                <button type="submit" data-testid={LANDING.leadSubmit} className="ld-btn ld-btn--primario mt-1 w-full">
                  <Send className="h-4 w-4" aria-hidden="true" /> Enviar por WhatsApp
                </button>
              </Cambio>
            )}
        </div>
      </div>
    </section>
  );
}
