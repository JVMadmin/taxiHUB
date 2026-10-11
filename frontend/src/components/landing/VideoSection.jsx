import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export function VideoSection() {
  return (
    <section aria-labelledby="video-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>Demostración en video</Eyebrow>
        <h2 id="video-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Míralo en acción en menos de un minuto.
        </h2>
        <p className="mt-3 text-base text-slate-600">
          Recorrido real por la terminal de la central, la app del chofer y el panel de liquidación de flotas.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-10 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/80">
        <div className="overflow-hidden rounded-xl bg-slate-900">
          <video
            data-testid={LANDING.video}
            controls
            playsInline
            preload="none"
            poster="/landing/video-poster.webp"
            width="1280"
            height="720"
            className="block h-auto w-full object-cover"
            aria-label="Video demostrativo de TaxiHUB con pantallas reales del producto"
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
