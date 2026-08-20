import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  brand: "text-brand-bright",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
};

// Tarjeta KPI del dashboard del dueño: un número, su etiqueta, y contexto
// opcional. Nunca decorativa — cada tarjeta responde una pregunta concreta.
export function KPICard({ icon: Icon, label, value, hint, tone = "default", className, testId }) {
  return (
    <div data-testid={testId} className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15">
            <Icon className="h-4 w-4 text-brand-bright" />
          </span>
        )}
      </div>
      <div className={cn("mono-num mt-2 text-2xl font-extrabold tracking-tight", TONES[tone] || TONES.default)}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default KPICard;
