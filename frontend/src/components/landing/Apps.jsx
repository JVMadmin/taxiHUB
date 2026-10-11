import { useNavigate } from "react-router-dom";
import { Download, Monitor, Smartphone, Building2, ExternalLink } from "lucide-react";
import { LANDING } from "@/constants/testIds";
import { Eyebrow, Reveal } from "./motion";

const APPS = [
  {
    icon: Monitor,
    title: "Central para Windows",
    note: "Acceso exclusivo de operadoras; reconoce el sitio al iniciar sesión.",
    size: "TaxiHub-Central.exe · < 1 MB",
    href: "/downloads/TaxiHub-Central.exe",
    testid: LANDING.downloadWindows,
    cta: "Descargar para Windows",
  },
  {
    icon: Smartphone,
    title: "App del Operador",
    note: "Para choferes. Android (APK de instalación directa).",
    size: "APK · ≈ 14 MB",
    href: "/downloads/taxiHUB-operador-debug.apk",
    testid: LANDING.downloadApkOperador,
    cta: "Descargar APK Operador",
  },
  {
    icon: Building2,
    title: "App de Socios",
    note: "Para dueños de flota. Android (APK de instalación directa).",
    size: "APK · ≈ 12 MB",
    href: "/downloads/taxiHUB-socio-debug.apk",
    testid: LANDING.downloadApkSocio,
    cta: "Descargar APK Socios",
  },
];

export function Apps() {
  const navigate = useNavigate();
  return (
    <section id="apps" aria-labelledby="apps-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="max-w-2xl">
        <Eyebrow>Apps</Eyebrow>
        <h2 id="apps-title" className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Instala la app que le toca a cada quien.
        </h2>
        <p className="mt-4 text-[#B4B8C2]">
          Cada aplicación muestra únicamente el inicio de sesión de su rol y apunta a taxihub.cloud.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {APPS.map((a, i) => {
          const Icon = a.icon;
          return (
            <Reveal key={a.title} delay={i * 0.06} className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2">
              <div className="flex h-full flex-col rounded-[1.4rem] bg-[#0B0D10] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-display mt-5 text-xl font-bold text-white">{a.title}</h3>
                <p className="mt-2 flex-1 text-[15px] text-[#B4B8C2]">{a.note}</p>
                <p className="mt-4 font-mono text-xs text-[#9CA0AA]">{a.size}</p>
                <a
                  href={a.href}
                  download
                  data-testid={a.testid}
                  className="mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-bold text-[#04130D] transition-colors duration-200 hover:bg-emerald-400"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {a.cta}
                </a>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#B4B8C2]">
        <span>¿Prefieres el navegador?</span>
        {[["Terminal de Central", "/terminal"], ["App del Operador", "/login"], ["Panel de Socio", "/dueno/login"]].map(([label, to]) => (
          <button key={to} type="button" onClick={() => navigate(to)} className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-white underline decoration-white/25 underline-offset-4 hover:decoration-emerald-400">
            {label}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
      </Reveal>
    </section>
  );
}
