import { Zap, MessageCircle, MapPin, Mic, Wallet, ShieldCheck, Check } from "lucide-react";
import { Eyebrow, Reveal } from "./motion";

const Card = ({ icon: Icon, tag, title, children, className = "", accent = false, delay = 0 }) => (
  <Reveal delay={delay} className={`rounded-[1.75rem] border p-2 ${accent ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03]"} ${className}`}>
    <div className="flex h-full flex-col rounded-[1.4rem] bg-[#0B0D10] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#B4B8C2]">{tag}</span>
      </div>
      <h3 className="font-display mt-5 text-xl font-bold leading-snug text-white sm:text-2xl">{title}</h3>
      <div className="mt-3 text-[15px] leading-relaxed text-[#B4B8C2]">{children}</div>
    </div>
  </Reveal>
);

const Bullets = ({ items }) => (
  <ul className="mt-5 space-y-2.5 text-sm text-[#D1D5DB]">
    {items.map((t) => (
      <li key={t} className="flex items-start gap-2.5">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

export function Features() {
  return (
    <section id="funciones" aria-labelledby="funciones-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>Funciones</Eyebrow>
        <h2 id="funciones-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Cada módulo resuelve un cuello de botella real de la central.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-5 md:grid-cols-6">
        <Card icon={Zap} tag="Despacho" title="Despacha sin ventanas de confirmación innecesarias." className="md:col-span-4">
          Despacho en 1 clic desde el menú del mapa, botonera de puntos calientes y atajos de teclado, con asignación de la unidad libre más cercana.
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[["F2", "Nuevo despacho"], ["1–6", "Elegir unidad"], ["W", "Panel WhatsApp"], ["Clic der.", "Despacho 1 clic"]].map(([k, d]) => (
              <div key={k} className="rounded-xl border border-white/[0.07] bg-[#12151B] p-3 text-center">
                <div className="font-mono text-sm font-semibold text-emerald-300">{k}</div>
                <div className="mt-1 text-xs text-[#B4B8C2]">{d}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card icon={MessageCircle} tag="WhatsApp" title="Responde solo, sin pagar por mensaje." className="md:col-span-2" accent delay={0.05}>
          Vincula el teléfono de la central por código QR. Al asignar una unidad, el sistema responde con número económico, vehículo, placas y tiempo estimado.
        </Card>

        <Card icon={ShieldCheck} tag="Protección" title="Escudo anti-bloqueo de 6 reglas." className="md:col-span-3" delay={0.05}>
          Diseñado para cuidar el número de la central.
          <Bullets items={[
            "Solo responde a clientes que escribieron primero (menos de 24 h)",
            "Simula escritura humana de 1,5 a 3,2 s",
            "Variación de texto en cada mensaje enviado",
            "Cola con límite de frecuencia y sesión persistente",
          ]} />
        </Card>

        <Card icon={MapPin} tag="Chofer" title="GPS y voz IA con la pantalla apagada." className="md:col-span-3" delay={0.1}>
          Servicio nativo en segundo plano que mantiene la ubicación y la lectura de viajes activas aunque el chofer bloquee el teléfono. Fotos de odómetro y combustible al abrir y cerrar turno.
          <div className="mt-5 flex items-center gap-2 text-sm text-[#D1D5DB]">
            <Mic className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Lectura de viajes por voz y respuesta hablada.
          </div>
        </Card>

        <Card icon={Wallet} tag="Socio" title="Liquidación diaria de cuotas." className="md:col-span-3" delay={0.05}>
          El dueño fija la cuota diaria, audita las fotos del tablero al cierre y confirma la recepción del efectivo, desde la web o la app Android.
        </Card>

        <Card icon={ShieldCheck} tag="Multi-sitio" title="Cada central, en su propio entorno aislado." className="md:col-span-3" delay={0.1}>
          Datos, índices y conexiones en tiempo real separados por sitio. Logotipo, colores, centro del mapa y puntos calientes configurables por central.
        </Card>
      </div>
    </section>
  );
}
