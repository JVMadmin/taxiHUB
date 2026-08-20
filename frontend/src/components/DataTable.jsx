import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

/**
 * DataTable — activa la clase `.th-table` (ya escrita en index.css, sin usar
 * hasta ahora) en vez de reimplementar tablas ad hoc por pantalla.
 * `columns`: [{ key, label, render?(row) }]. Contempla los 3 estados que
 * antes faltaban en varios paneles: cargando / error / vacío.
 */
export function DataTable({
  columns,
  rows,
  keyField = "id",
  onRowClick,
  loading,
  error,
  onRetry,
  emptyIcon,
  emptyTitle = "Sin datos",
  emptyDescription,
  className,
  testId,
}) {
  if (loading) return <LoadingState rows={5} testId={testId && `${testId}-loading`} />;
  if (error) return <ErrorState description={error} onRetry={onRetry} testId={testId && `${testId}-error`} />;
  if (!rows || rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} testId={testId && `${testId}-empty`} />;
  }
  return (
    <div data-testid={testId} className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className="th-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "text-right" : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[keyField]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
              data-testid={testId && `${testId}-row-${row[keyField]}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                  {c.render ? c.render(row) : row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
