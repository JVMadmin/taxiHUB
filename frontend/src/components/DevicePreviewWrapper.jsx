import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Smartphone,
  Maximize2,
  ExternalLink,
  Car,
  User,
  GripHorizontal,
  RotateCcw,
  Wifi,
  BatteryCharging,
  Layers,
  SplitSquareVertical,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import "./DevicePreviewWrapper.css";

const STORAGE_KEY = "taxihub_web_preview_mode";

// Hook reutilizable para hacer arrastrable cualquier chasis de teléfono
function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const onDragStart = (e) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: offset.x,
      initialY: offset.y,
    };
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setOffset({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };
    const onPointerUp = () => {
      if (isDragging) setIsDragging(false);
    };
    if (isDragging) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging]);

  const reset = () => setOffset({ x: 0, y: 0 });

  return { offset, onDragStart, reset, isMoved: offset.x !== 0 || offset.y !== 0 };
}

// Subcomponente de chasis de smartphone con Dynamic Island, barra de estado y controles
function PhoneChassis({
  title,
  badge,
  badgeType,
  phoneTime,
  dragOffset,
  onDragStart,
  children,
}) {
  return (
    <div
      className="device-preview-drag-area"
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      {badge && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span className={`device-preview-dual-badge device-preview-dual-badge-${badgeType}`}>
            {badge}
          </span>
        </div>
      )}

      {/* Barra de agarre para arrastrar el teléfono */}
      <div
        className="device-preview-drag-bar"
        onPointerDown={onDragStart}
        title="Haz clic y arrastra para mover el celular libremente en tu pantalla"
      >
        <GripHorizontal size={14} />
        <span>{title || "Mover teléfono en pantalla"}</span>
      </div>

      {/* Chasis simulador de teléfono inteligente */}
      <div className="device-preview-chassis">
        {/* Barra de estado del teléfono (Reloj, 5G, WiFi, Batería) */}
        <div className="device-status-bar">
          <span>{phoneTime}</span>
          <div className="device-status-icons">
            <span style={{ fontSize: "10px", fontWeight: 800, opacity: 0.85 }}>5G</span>
            <Wifi size={12} strokeWidth={2.4} />
            <BatteryCharging size={14} strokeWidth={2.4} />
          </div>
        </div>

        {/* Dynamic Island / Notch superior */}
        <div className="device-preview-notch">
          <div className="device-preview-lens" />
        </div>

        {/* Pantalla donde corre la aplicación nativa */}
        <div className="device-preview-screen">{children}</div>

        {/* Indicador de barra de inicio inferior */}
        <div className="device-preview-home-indicator" />
      </div>
    </div>
  );
}

export function DevicePreviewWrapper({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Detectar si estamos en APK nativa de Android o Capacitor
  const isNative =
    typeof window !== "undefined" &&
    (Boolean(window.Capacitor?.isNativePlatform?.()) ||
      Capacitor.isNativePlatform() ||
      window.location.protocol === "capacitor:" ||
      Boolean(window.__TAXIHUB_APP_MODE__));

  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  // Detectar si fue abierto como ventana emergente pop-up dedicada o modo dual por query
  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const isPopup = searchParams ? searchParams.get("view") === "popup" : false;
  const queryDual = searchParams
    ? searchParams.get("dual") === "1" || searchParams.get("dual") === "true"
    : false;

  // Detectar ancho de pantalla física (en ventana normal)
  const [isSmallScreen, setIsSmallScreen] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640 && !isPopup
  );

  // Modo: "dual" (ambos lados a lado) | "mobile" (un solo celular) | "fullscreen" (pantalla completa)
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "fullscreen";
    if (queryDual) return "dual";
    if (isPopup) return "mobile";
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dual" || saved === "mobile" || saved === "fullscreen") return saved;
    return window.innerWidth >= 1200 ? "dual" : window.innerWidth >= 640 ? "mobile" : "fullscreen";
  });

  // Hora actual para la barra de estado del celular
  const [phoneTime, setPhoneTime] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setPhoneTime(d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Controladores de arrastre independientes
  const singleDrag = useDraggable();
  const driverDrag = useDraggable();
  const passengerDrag = useDraggable();

  const resetAllPositions = () => {
    singleDrag.reset();
    driverDrag.reset();
    passengerDrag.reset();
  };

  useEffect(() => {
    const handleResize = () => {
      if (!isPopup) {
        setIsSmallScreen(window.innerWidth < 640);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isPopup]);

  const triggerMapResize = useCallback(() => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 550);
  }, []);

  const handleToggleMode = useCallback(
    (newMode) => {
      setMode(newMode);
      try {
        localStorage.setItem(STORAGE_KEY, newMode);
      } catch (_) {}
      triggerMapResize();
    },
    [triggerMapResize]
  );

  // Abrir ventana emergente
  const handleOpenPopupWindow = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = mode === "dual" ? 940 : 480;
    const h = 980;
    const left = window.screen.width ? (window.screen.width - w) / 2 : 100;
    const top = window.screen.height ? Math.max(20, (window.screen.height - h) / 2) : 50;
    const cleanUrl = `${window.location.origin}${window.location.pathname}?view=popup${mode === "dual" ? "&dual=1" : ""}`;
    window.open(
      cleanUrl,
      "_blank",
      `width=${w},height=${h},top=${top},left=${left},scrollbars=no,resizable=yes`
    );
  }, [mode]);

  // Si es app nativa instalada o móvil físico real en vista normal, o dentro de iframe en modo dual
  if (isNative || isInIframe || (isSmallScreen && !isPopup)) {
    return <>{children}</>;
  }

  const isOperadorPath =
    location.pathname.startsWith("/operador") || location.pathname === "/login";
  const isPasajeroPath =
    location.pathname.startsWith("/pasajero") || location.pathname.startsWith("/mi-taxi");

  const anyMoved = singleDrag.isMoved || driverDrag.isMoved || passengerDrag.isMoved;

  // VISTA EN MODO DUAL (Ambos celulares lado a lado: Conductor + Pasajero)
  if (mode === "dual") {
    return (
      <div className="device-preview-backdrop">
        {/* Barra superior de herramientas */}
        <div className="device-preview-toolbar" style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => handleToggleMode("mobile")}
              className="device-preview-toolbar-btn device-preview-btn-ghost"
              title="Ver solo un celular"
            >
              <Smartphone size={14} />
              <span>Un Solo Celular</span>
            </button>

            {!isPopup && (
              <button
                type="button"
                onClick={() => handleToggleMode("fullscreen")}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Expandir a tamaño completo del navegador"
              >
                <Maximize2 size={13} />
                <span>Pantalla Completa</span>
              </button>
            )}

            {!isPopup && (
              <button
                type="button"
                onClick={handleOpenPopupWindow}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Abrir en ventana emergente independiente"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">Pop-up</span>
              </button>
            )}

            {anyMoved && (
              <button
                type="button"
                onClick={resetAllPositions}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Centrar ambos celulares en la pantalla"
              >
                <RotateCcw size={12} />
                <span>Centrar Ambos</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="device-preview-dual-badge device-preview-dual-badge-driver"
              style={{ margin: 0, padding: "4px 8px", fontSize: 10 }}
            >
              Conductor TX-101
            </span>
            <span style={{ color: "#64748b", fontSize: 12 }}>+</span>
            <span
              className="device-preview-dual-badge device-preview-dual-badge-passenger"
              style={{ margin: 0, padding: "4px 8px", fontSize: 10 }}
            >
              Pasajero
            </span>
          </div>
        </div>

        {/* Contenedor lado a lado de ambos celulares */}
        <div className="device-preview-dual-container">
          {/* CELULAR 1: CONDUCTOR (OPERADOR) */}
          <div className="device-preview-dual-item">
            <PhoneChassis
              title="Mover Conductor"
              badge="🚗 Conductor (TX-101)"
              badgeType="driver"
              phoneTime={phoneTime}
              dragOffset={driverDrag.offset}
              onDragStart={driverDrag.onDragStart}
            >
              {isOperadorPath ? (
                children
              ) : (
                <iframe
                  src="/operador"
                  title="App Conductor"
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                />
              )}
            </PhoneChassis>
          </div>

          {/* CELULAR 2: PASAJERO (CLIENTE) */}
          <div className="device-preview-dual-item">
            <PhoneChassis
              title="Mover Pasajero"
              badge="👤 Pasajero (Cliente)"
              badgeType="passenger"
              phoneTime={phoneTime}
              dragOffset={passengerDrag.offset}
              onDragStart={passengerDrag.onDragStart}
            >
              {isPasajeroPath ? (
                children
              ) : (
                <iframe
                  src="/pasajero"
                  title="App Pasajero"
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                />
              )}
            </PhoneChassis>
          </div>
        </div>
      </div>
    );
  }

  // VISTA EN TAMAÑO CELULAR INDIVIDUAL (Marco de celular movible)
  if (mode === "mobile" || isPopup) {
    return (
      <div className="device-preview-backdrop">
        {/* Barra superior de herramientas */}
        <div className="device-preview-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => handleToggleMode("dual")}
              className="device-preview-toolbar-btn device-preview-btn-primary"
              title="Ver ambos celulares (Conductor + Pasajero) lado a lado en pantalla"
            >
              <SplitSquareVertical size={14} />
              <span>Modo Dual</span>
            </button>

            {!isPopup && (
              <button
                type="button"
                data-testid="device-preview-toggle"
                onClick={() => handleToggleMode("fullscreen")}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Expandir a tamaño completo del navegador"
              >
                <Maximize2 size={13} />
                <span className="hidden sm:inline">Pantalla Completa</span>
              </button>
            )}

            {!isPopup && (
              <button
                type="button"
                onClick={handleOpenPopupWindow}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Abrir en ventana emergente independiente"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">Pop-up</span>
              </button>
            )}

            {singleDrag.isMoved && (
              <button
                type="button"
                onClick={singleDrag.reset}
                className="device-preview-toolbar-btn device-preview-btn-ghost"
                title="Centrar celular en la pantalla"
              >
                <RotateCcw size={12} />
                <span>Centrar</span>
              </button>
            )}
          </div>

          {/* Accesos directos para alternar entre Conductor y Pasajero */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                navigate(isPopup ? "/operador?view=popup" : "/operador");
                triggerMapResize();
              }}
              className={`device-preview-toolbar-btn ${
                isOperadorPath
                  ? "device-preview-btn-active"
                  : "device-preview-btn-ghost"
              }`}
              title="Ir a App de Conductor / Operador"
            >
              <Car size={13} />
              <span>Conductor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                navigate(isPopup ? "/pasajero?view=popup" : "/pasajero");
                triggerMapResize();
              }}
              className={`device-preview-toolbar-btn ${
                isPasajeroPath
                  ? "device-preview-btn-active"
                  : "device-preview-btn-ghost"
              }`}
              title="Ir a App de Pasajero / Cliente"
            >
              <User size={13} />
              <span>Pasajero</span>
            </button>
          </div>
        </div>

        {/* Chasis del celular con la app actual */}
        <PhoneChassis
          title="Mover teléfono en pantalla"
          phoneTime={phoneTime}
          dragOffset={singleDrag.offset}
          onDragStart={singleDrag.onDragStart}
        >
          {children}
        </PhoneChassis>
      </div>
    );
  }

  // VISTA EN PANTALLA COMPLETA
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Botón flotante superior derecho */}
      <div className="device-preview-fullscreen-floating">
        <button
          type="button"
          onClick={() => handleToggleMode("dual")}
          className="device-preview-toolbar-btn device-preview-btn-primary"
          title="Ver ambos celulares lado a lado para pruebas"
        >
          <SplitSquareVertical size={14} />
          <span>Modo Dual</span>
        </button>

        <button
          type="button"
          data-testid="device-preview-toggle"
          onClick={() => handleToggleMode("mobile")}
          className="device-preview-toolbar-btn device-preview-btn-ghost"
          title="Ver en formato y simulador de celular movible"
        >
          <Smartphone size={14} />
          <span>Celular</span>
        </button>

        <button
          type="button"
          onClick={() => {
            navigate(isOperadorPath ? "/pasajero" : "/operador");
            triggerMapResize();
          }}
          className="device-preview-toolbar-btn device-preview-btn-ghost"
          title={
            isOperadorPath
              ? "Ir a App Pasajero (/pasajero)"
              : "Ir a App Conductor (/operador)"
          }
        >
          {isOperadorPath ? <User size={13} /> : <Car size={13} />}
          <span>{isOperadorPath ? "Pasajero" : "Conductor"}</span>
        </button>
      </div>

      {/* Contenido completo de la app */}
      {children}
    </div>
  );
}

export default DevicePreviewWrapper;
