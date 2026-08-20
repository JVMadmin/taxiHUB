import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

// Confirmación para acciones críticas (Fase 9, sección 32): eliminar vehículo,
// cancelar servicio, marcar averiado, etc. Sin confirmaciones innecesarias
// para acciones frecuentes.
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  danger = true,
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="border-border bg-popover text-popover-foreground">
        <AlertDialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/15">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <AlertDialogTitle className="text-foreground">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-muted-foreground">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border bg-secondary text-foreground/90 hover:bg-secondary/70 hover:text-foreground">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={danger
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-brand text-brand-contrast hover:bg-brand-bright"}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}