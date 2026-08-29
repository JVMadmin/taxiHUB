import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import { PhoneCall, Plus, Minus, ClipboardList, LayoutPanelLeft, Menu as MenuIcon } from "@/design/icons";

/**
 * OpsMobileDock — dock inferior de acciones para móvil/tablet (DS 2.0).
 * Llamada rápida, zoom, servicios, flota y menú admin.
 */
export function OpsMobileDock({
  onNuevaLlamada, onZoomIn, onZoomOut,
  serviciosOpen, onToggleServicios, sidebarOpen, onToggleSidebar,
  adminSection, onToggleAdmin, hidden,
}) {
  return (
    <div
      data-testid="terminal-mobile-dock"
      className={cn(
        "pointer-events-auto absolute inset-x-3 bottom-3 z-[560] lg:hidden",
        hidden && "hidden"
      )}
    >
      <div className="bezel-shell flex items-center gap-2 px-2 py-2">
        <Button data-testid="dock-nueva-llamada" onClick={onNuevaLlamada} size="sm" className="flex-1">
          <PhoneCall className="th-icon-3d h-4 w-4" /> Llamada
        </Button>
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={onZoomIn} data-testid="dock-zoom-in" aria-label="Acercar" className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 hover:bg-white/[0.08]">
            <Plus className="th-icon-3d h-4 w-4" />
          </button>
          <button onClick={onZoomOut} data-testid="dock-zoom-out" aria-label="Alejar" className="th-3d flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 hover:bg-white/[0.08]">
            <Minus className="th-icon-3d h-4 w-4" />
          </button>
        </div>
        <button
          onClick={onToggleServicios}
          data-testid="dock-servicios"
          aria-label="Servicios"
          className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
            serviciosOpen ? "bg-th-live text-[#0B0D10]" : "text-foreground/80 hover:bg-white/[0.08]")}
        >
          <ClipboardList className="th-icon-3d h-5 w-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          data-testid="dock-flota"
          aria-label="Panel de flota"
          className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
            sidebarOpen ? "bg-th-live text-[#0B0D10]" : "text-foreground/80 hover:bg-white/[0.08]")}
        >
          <LayoutPanelLeft className="th-icon-3d h-5 w-5" />
        </button>
        <button
          onClick={onToggleAdmin}
          data-testid="dock-menu"
          aria-label="Menú de administración"
          className={cn("th-3d flex h-11 w-11 items-center justify-center rounded-xl",
            adminSection ? "bg-th-live text-[#0B0D10]" : "text-foreground/80 hover:bg-white/[0.08]")}
        >
          <MenuIcon className="th-icon-3d h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default OpsMobileDock;
