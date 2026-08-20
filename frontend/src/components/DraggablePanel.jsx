import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * DraggablePanel — envuelve un panel flotante absoluto y lo hace arrastrable
 * con el ratón desde cualquier zona (excepto controles interactivos como
 * botones/inputs). La posición se persiste por panel en localStorage.
 *
 * El desplazamiento se aplica como `transform: translate(x,y)` sobre la
 * posición base que define `className` (absolute + top/bottom/left/right).
 */
export function DraggablePanel({
  dragKey,
  className,
  style,
  children,
  disabled = false,
}) {
  const [off, setOff] = useState(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    if (window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth < 768) return { x: 0, y: 0 };
    try {
      const raw = localStorage.getItem(`th_drag_${dragKey}`);
      return raw ? JSON.parse(raw) : { x: 0, y: 0 };
    } catch {
      return { x: 0, y: 0 };
    }
  });
  const drag = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(`th_drag_${dragKey}`, JSON.stringify(off)); } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [off, dragKey]);

  const onStart = useCallback((e) => {
    if (disabled) return;
    if (e.button === 2 || e.type === "touchstart") return;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return;
    const t = e.target;
    if (t.closest?.("a,button,input,select,textarea,label,[contenteditable],.leaflet-interactive,[role='button'],[data-no-drag]")) return;
    drag.current = {
      sx: e.clientX, sy: e.clientY,
      ox: off.x, oy: off.y,
      moved: false,
    };
    document.body.style.userSelect = "none";
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [disabled, off]);

  const onMove = useCallback((e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return;
    drag.current.moved = true;
    const nx = clamp(drag.current.ox + dx, -window.innerWidth * 0.95, window.innerWidth * 0.95);
    const ny = clamp(drag.current.oy + dy, -window.innerHeight * 0.92, window.innerHeight * 0.92);
    setOff({ x: nx, y: ny });
  }, []);

  const onEnd = useCallback(() => {
    if (!drag.current) return;
    document.body.style.userSelect = "";
    drag.current = null;
  }, []);

  return (
    <div
      className={cn("th-draggable cursor-grab active:cursor-grabbing", className)}
      style={{ transform: `translate(${off.x}px, ${off.y}px)`, ...style }}
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    >
      {children}
    </div>
  );
}

export default DraggablePanel;