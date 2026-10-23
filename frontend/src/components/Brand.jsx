import React, { useId } from "react";
import { cn } from "@/lib/utils";

// Identidad visual taxiHUB — Central y Despacho Satelital.
// Isotipo representativo: Pin GPS satelital + silueta frontal de Taxi con copete iluminado + ondas de radio.
// Paleta emblemática: Amarillo luminoso (#FFE600 -> #FF9900) con contraste obsidian (#0C0E14).
export function BrandMark({ className, size = "md", logoUrl = null }) {
  const gradId = useId();

  const sizeClasses = {
    xs: "h-7 w-7 rounded-lg",
    sm: "h-9 w-9 rounded-xl",
    md: "h-11 w-11 rounded-2xl",
    lg: "h-14 w-14 rounded-2xl",
    xl: "h-18 w-18 rounded-[22px]",
  };

  const iconSizes = {
    xs: "h-5 w-5",
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
    xl: "h-14 w-14",
  };

  const s = sizeClasses[size] || sizeClasses.md;
  const iconSize = iconSizes[size] || iconSizes.md;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-amber-400/40",
        "shadow-[0_4px_18px_rgba(255,230,0,0.22)] transition-transform duration-200",
        s,
        className
      )}
      style={{
        background: "linear-gradient(145deg, #181B22 0%, #0C0E14 100%)",
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo del sitio"
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className={cn("shrink-0", iconSize)}
          aria-label="taxiHUB Isotipo"
        >
          <defs>
            <linearGradient
              id={gradId}
              x1="12"
              y1="6"
              x2="36"
              y2="44"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFE600" />
              <stop offset="100%" stopColor="#FF9900" />
            </linearGradient>
          </defs>
          {/* Ondas satelitales superiores de radiodespacho */}
          <path
            d="M16.5 7.2C20.8 3.8 27.2 3.8 31.5 7.2"
            stroke={`url(#${gradId})`}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M13 4.2C19.5 -0.5 28.5 -0.5 35 4.2"
            stroke="#FFE600"
            strokeWidth="1.6"
            strokeOpacity="0.45"
            strokeLinecap="round"
          />
          {/* Silueta Pin GPS en degradado amarillo luminoso */}
          <path
            d="M24 44.5C24 44.5 38.5 32.5 38.5 21.5C38.5 13.5 32 7.2 24 7.2C16 7.2 9.5 13.5 9.5 21.5C9.5 32.5 24 44.5 24 44.5Z"
            fill={`url(#${gradId})`}
          />
          {/* Núcleo oscuro para profundidad tridimensional */}
          <circle cx="24" cy="21.5" r="11" fill="#0B0E14" />
          {/* Copete TAXI iluminado con brillo neón */}
          <rect x="20.5" y="13.2" width="7" height="2.5" rx="1.2" fill="#FFE600" />
          {/* Silueta frontal del Taxi */}
          <path
            d="M16.5 21.2L18.2 16.5C18.6 15.6 19.5 15.2 20.5 15.2H27.5C28.5 15.2 29.4 15.6 29.8 16.5L31.5 21.2V26.2C31.5 26.8 31 27.2 30.4 27.2H29.2C28.6 27.2 28.2 26.8 28.2 26.2V25H19.8V26.2C19.8 26.8 19.4 27.2 18.8 27.2H17.6C17 27.2 16.5 26.8 16.5 26.2V21.2Z"
            fill="#F8FAFC"
          />
          {/* Parabrisas negro tintado */}
          <path d="M18.6 20.3L19.7 17H28.3L29.4 20.3H18.6Z" fill="#0B0E14" />
          {/* Faros delanteros tipo led amarillo luminoso */}
          <circle cx="18.8" cy="22.8" r="1.3" fill="#FFE600" />
          <circle cx="29.2" cy="22.8" r="1.3" fill="#FFE600" />
          {/* Rejilla frontal */}
          <rect x="21.5" y="22.3" width="5" height="1.1" rx="0.5" fill="#0B0E14" />
        </svg>
      )}
    </div>
  );
}

export function BrandWordmark({
  className,
  sub = "CENTRAL Y DESPACHO SATELITAL",
  title = null,
}) {
  return (
    <div className={cn("leading-none select-none", className)}>
      <div className="flex items-baseline text-[1.12rem] font-black tracking-tight">
        {title ? (
          <span className="text-slate-900 dark:text-white">{title}</span>
        ) : (
          <>
            <span className="text-slate-900 dark:text-slate-100">taxi</span>
            <span
              className="ml-0.5 text-amber-500 dark:text-[#FFE600]"
              style={{
                textShadow: "0 0 14px rgba(255,230,0, 0.45)",
              }}
            >
              HUB
            </span>
          </>
        )}
      </div>
      {sub && (
        <div className="mt-1 text-[9px] font-mono font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {sub}
        </div>
      )}
    </div>
  );
}

// Marca + palabra en una sola composición (headers de Terminal, Operador, Pasajero, Landing).
export function BrandLockup({
  sub,
  className,
  markSize = "md",
  logoUrl = null,
  title = null,
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={markSize} logoUrl={logoUrl} />
      <BrandWordmark sub={sub} title={title} />
    </div>
  );
}
