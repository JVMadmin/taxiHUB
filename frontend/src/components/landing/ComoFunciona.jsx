import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { PlayCircle, X } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Etiqueta, Reveal, useMediaQuery } from "./motion";

// El flujo real del despacho (motor de servidor + Terminal + apps).
const PASOS = [
  {
    titulo: "Entra el pedido",
    texto: "Por llamada, por WhatsApp o desde la app del pasajero. Si el cliente mandó su ubicación, el servicio se crea desde ahí.",
    donde: "Terminal · WhatsApp · App pasajero",
  },
  {
    titulo: "Se ubica en el mapa",
    texto: "Búsqueda de calles, puntos frecuentes de tu ciudad y colonias con su tarifa, para no capturar direcciones a mano.",
    donde: "Terminal",
  },
  {
    titulo: "Se ofrece al más cercano",
    texto: "A una unidad libre a la vez, por cercanía. Si no responde a tiempo, la oferta pasa sola a la siguiente.",
    donde: "Motor de despacho",
  },
  {
    titulo: "El chofer acepta y llega",
    texto: "Recibe la oferta con aviso, ve los datos del cliente y navega hasta el punto con el mapa 3D.",
    donde: "App del chofer",
  },
  {
    titulo: "Seguimiento hasta el cierre",
    texto: "La central ve la unidad en vivo. Al terminar, el viaje queda en el historial y en el panel del socio.",
    donde: "Terminal · Panel del socio",
  },
];

function DialogoVideo({ abierto, onCerrar }) {
  const ref = useRef(null);
  const videoRef = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      videoRef.current?.play().catch(() => {});
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className="ld-dialogo"
      aria-labelledby="video-titulo"
      data-testid={LANDING.videoDialogo}
      onClose={() => {
        videoRef.current?.pause();
        onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[rgba(148,172,204,0.12)] px-5 py-3.5">
        <h3 id="video-titulo" className="text-[15px] font-semibold">Recorrido real de TaxiHUB: Terminal, app del chofer y panel del socio</h3>
        <button type="button" onClick={onCerrar} className="grid h-10 w-10 place-items-center rounded-xl text-[#B7C4D4] hover:bg-white/5" aria-label="Cerrar video">
          <X className="h-5 w-5" />
        </button>
      </div>
      <video ref={videoRef} className="block w-full bg-black" controls muted playsInline preload="none" poster="/landing/video-poster.webp">
        <source src="/landing/taxihub-demo.webm" type="video/webm" />
        <source src="/landing/taxihub-demo.mp4" type="video/mp4" />
      </video>
    </dialog>
  );
}

export function ComoFunciona() {
  const reduce = useReducedMotion();
  const horizontal = useMediaQuery("(min-width: 1024px)");
  const ref = useRef(null);
  const [activos, setActivos] = useState(reduce ? PASOS.length : 1);
  const [video, setVideo] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const progreso = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reduce) setActivos(Math.max(1, Math.min(PASOS.length, Math.ceil(v * PASOS.length + 0.001))));
  });
  const relleno = reduce ? 1 : progreso;

  return (
    <section id="como-funciona" aria-labelledby="como-titulo" className="ld-seccion">
      <div className="ld-contenedor">
        <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-[40rem]">
            <Etiqueta>Cómo funciona</Etiqueta>
            <h2 id="como-titulo" className="ld-h2 mt-4">Del pedido a la unidad en camino, sin pasos a ciegas.</h2>
          </div>
          <button type="button" data-testid={LANDING.videoAbrir} onClick={() => setVideo(true)} className="ld-btn ld-btn--secundario justify-self-start">
            <PlayCircle className="h-5 w-5" aria-hidden="true" /> Ver el recorrido real en video
          </button>
        </Reveal>

        <ol ref={ref} className="ld-flujo mt-14" data-testid={LANDING.flujo}>
          {horizontal ? (
            <>
              <span aria-hidden="true" className="ld-flujo-riel left-[15px] right-0 top-[14px] h-px" />
              <motion.span aria-hidden="true" className="ld-flujo-relleno left-[15px] right-0 top-[14px] h-[2px]" style={{ scaleX: relleno }} />
            </>
          ) : (
            <>
              <span aria-hidden="true" className="ld-flujo-riel bottom-6 left-[14px] top-[15px] w-px" />
              <motion.span aria-hidden="true" className="ld-flujo-relleno bottom-6 left-[14px] top-[15px] w-[2px]" style={{ scaleY: relleno, transformOrigin: "top" }} />
            </>
          )}
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="ld-paso" data-activo={i < activos}>
              <span className="ld-paso-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="ld-h3">{p.titulo}</h3>
              <p className="ld-cuerpo mt-2 text-[14.5px]">{p.texto}</p>
              <span className="ld-paso-donde">{p.donde}</span>
            </li>
          ))}
        </ol>
      </div>
      <DialogoVideo abierto={video} onCerrar={() => setVideo(false)} />
    </section>
  );
}
