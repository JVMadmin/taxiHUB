import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export function VideoSection() {
  return (
    <section aria-labelledby="video-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>En acción</Eyebrow>
        <h2 id="video-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Míralo en menos de un minuto.
        </h2>
        <p className="mt-4 text-[#B4B8C2]">Recorrido por la terminal, la app del chofer y el panel del socio, con pantallas reales.</p>
      </Reveal>
      <Reveal delay={0.1} className="mt-10 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2">
        <div className="overflow-hidden rounded-[1.4rem] bg-black">
          <video
            data-testid={LANDING.video}
            controls
            playsInline
            preload="none"
            poster="/landing/video-poster.webp"
            width="1280"
            height="720"
            className="block h-auto w-full"
            aria-label="Video de demostración de TaxiHUB con subtítulos incrustados"
          >
            <source src="/landing/taxihub-demo.webm" type="video/webm" />
            <source src="/landing/taxihub-demo.mp4" type="video/mp4" />
            Tu navegador no puede reproducir este video.
          </video>
        </div>
      </Reveal>
    </section>
  );
}
