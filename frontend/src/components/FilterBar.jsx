import { cn } from "@/lib/utils";

// Envoltorio de layout para una fila de filtros (fecha/vehículo/conductor/
// estado…). Los controles concretos los compone quien la usa, sobre los
// componentes ui/ ya existentes (Select, Input) — evita una API genérica que
// nadie más necesita.
export function FilterBar({ children, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5", className)}>
      {children}
    </div>
  );
}

export default FilterBar;
