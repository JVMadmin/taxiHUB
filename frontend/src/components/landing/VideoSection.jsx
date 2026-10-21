import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

export function VideoSection() {
  return (
    <section aria-labelledby="video-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>En video</Eyebrow>
        <h2 id="video-title" className="font-display l-titulo mt-3">
          Míralo funcionar en 30 segundos.
        </h2>
        <p className="mt-3 text-base text-[#a1a6b2]">
          Grabado en la demo real: la central con la flota en vivo, la app del chofer con navegación 3D y el panel del dueño.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="l-ventana mt-10">
        <div className="overflow-hidden rounded-[14px] bg-black">
          <video
            data-testid={LANDING.video}
            controls
            playsInline
            preload="none"
            poster="/landing/video-poster.webp"
            width="1280"
            height="800"
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
