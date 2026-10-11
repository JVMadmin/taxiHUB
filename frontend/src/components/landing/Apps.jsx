import { Download, Monitor, Smartphone, ShieldCheck } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

const APPS = [
  {
    icon: Monitor,
    title: "Terminal Central Windows",
    sub: "Para operadoras y despachadoras",
    tag: "Instalador nativo (.exe)",
    ver: "v4.2.0 · 64-bit",
    href: "/downloads/TaxiHub-Central.exe",
    tid: LANDING.downloadWindows,
    color: "emerald",
  },
  {
    icon: Smartphone,
    title: "App Operador Android",
    sub: "GPS continuo y Voz IA",
    tag: "Paquete APK (14.9 MB)",
    ver: "Android 8.0+",
    href: "/downloads/taxiHUB-operador-debug.apk",
    tid: LANDING.downloadApkOperador,
    color: "sky",
  },
  {
    icon: ShieldCheck,
    title: "App Socio & Concesionario",
    sub: "Liquidación de cuotas diarias",
    tag: "Paquete APK (12.3 MB)",
    ver: "Android 8.0+",
    href: "/downloads/taxiHUB-socio-debug.apk",
    tid: LANDING.downloadApkSocio,
    color: "amber",
  },
];

export function Apps() {
  return (
    <section id="apps" aria-labelledby="apps-title" className="border-t border-slate-200/80 bg-slate-50/60 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Descargas directas</Eyebrow>
          <h2 id="apps-title" className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Instala las aplicaciones oficiales en tu equipo.
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Binarios oficiales listos para producción. Sin intermediarios ni tiendas de aplicaciones requeridas.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.map((app, i) => {
            const Icon = app.icon;
            return (
              <Reveal
                key={app.title}
                delay={i * 0.08}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                      <Icon className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
                      {app.ver}
                    </span>
                  </div>
                  <h3 className="font-display mt-5 text-xl font-bold text-slate-900">{app.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{app.sub}</p>
                  <div className="mt-4 inline-block rounded-md bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-800 border border-emerald-200">
                    {app.tag}
                  </div>
                </div>

                <a
                  href={app.href}
                  download
                  data-testid={app.tid}
                  className="mt-8 flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-slate-800 active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Descargar archivo</span>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
