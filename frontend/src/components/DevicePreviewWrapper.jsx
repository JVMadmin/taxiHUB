import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Maximize2,
  ExternalLink,
  Car,
  User,
  GripHorizontal,
  RotateCcw,
  Wifi,
  BatteryCharging,
  SplitSquareVertical,
  Volume2,
  Navigation,
  MapPinned,
  Camera,
  Receipt,
  Radar,
  MessageCircle,
  Star,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BrandMark } from "@/components/Brand";
import { DEMO } from "@/constants/testIds";
import "./DevicePreviewWrapper.css";

const STORAGE_KEY = "taxihub_web_preview_mode";

// Textos del producto para la vista de demostración (lo que se ve en los videos).
// Solo funciones que existen en las apps.
const FUNCIONES_CHOFER = [
  { icon: Volume2, titulo: "Recibe el viaje por voz", texto: "La oferta llega con aviso sonoro y se acepta con un toque." },
  { icon: Navigation, titulo: "Navegación 3D al pasajero", texto: "Mapa con edificios y relieve que gira con el taxi, con distancia y tiempo." },
  { icon: Radar, titulo: "GPS con la pantalla apagada", texto: "La central lo sigue en el mapa aunque el teléfono vaya guardado." },
  { icon: Camera, titulo: "Turno con evidencia", texto: "Fotos de odómetro y gasolina al abrir y cerrar turno." },
];
const FUNCIONES_PASAJERO = [
  { icon: Receipt, titulo: "Cotiza y pide en segundos", texto: "Marca su ubicación y ve la tarifa estimada antes de pedir." },
  { icon: MapPinned, titulo: "Ve llegar su taxi", texto: "Sigue la unidad en el mapa con el nombre del chofer y las placas." },
  { icon: MessageCircle, titulo: "Chat con el chofer", texto: "Mensajes y fotos del punto de encuentro." },
  { icon: Star, titulo: "Califica el viaje", texto: "Al terminar deja sus estrellas y un comentario." },
];
const TITULARES = {
  dual: {
    titulo: "Del pedido al viaje, en tiempo real",
    texto: "El pasajero pide su taxi, la central lo asigna y el chofer lo recibe por voz y llega con navegación 3D.",
  },
  operador: {
    titulo: "App del chofer",
    texto: "Todo lo que el taxista necesita para trabajar sin soltar el volante.",
  },
  pasajero: {
    titulo: "App del pasajero",
    texto: "Pedir un taxi seguro, saber quién llega y cuánto cuesta.",
  },
};

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

// Encabezado de la demostración: logo oficial, nombre y frase del producto.
function DemoEncabezado({ vista }) {
  const t = TITULARES[vista] || TITULARES.dual;
  return (
    <header className="demo-encabezado" data-testid={DEMO.encabezado}>
      <div className="demo-marca">
        <BrandMark size="lg" />
        <div>
          <div className="demo-marca-nombre">
            taxi<span>HUB</span>
          </div>
          <div className="demo-marca-sub">CENTRAL Y DESPACHO SATELITAL</div>
        </div>
      </div>
      <h1 className="demo-titulo">{t.titulo}</h1>
      <p className="demo-texto">{t.texto}</p>
    </header>
  );
}

// Columna de funciones junto a un celular (se oculta en pantallas angostas).
function DemoFunciones({ titulo, items, lado }) {
  return (
    <aside className={`demo-funciones demo-funciones-${lado}`} aria-label={titulo}>
      <div className="demo-funciones-titulo">{titulo}</div>
      <ul>
        {items.map(({ icon: Icon, titulo: t, texto }) => (
          <li key={t}>
            <span className="demo-funciones-icono">
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <div>
              <strong>{t}</strong>
              <p>{texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DemoPie() {
  return (
    <footer className="demo-pie">
      <span>taxihub.cloud</span>
      <span className="demo-pie-punto" aria-hidden="true" />
      <span>WhatsApp +52 916 163 2304</span>
    </footer>
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

  // Modo: "dual" (ambos lado a lado) | "mobile" (solo la app elegida) | "fullscreen" (pantalla completa)
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
    const w = mode === "dual" ? 1280 : 760;
    const h = 1000;
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

  // Una sola app: se cambia de ruta y se muestra solo esa en su celular.
  const verSolo = (ruta) => {
    handleToggleMode("mobile");
    navigate(isPopup ? `${ruta}?view=popup` : ruta);
  };

  const anyMoved = singleDrag.isMoved || driverDrag.isMoved || passengerDrag.isMoved;
  const vista = mode === "dual" ? "dual" : isPasajeroPath ? "pasajero" : "operador";

  // Barra superior (siempre arriba): modo dual, una sola app, pantalla completa y pop-up.
  const barra = (
    <nav className="device-preview-toolbar demo-barra" data-testid={DEMO.barra} aria-label="Vista de demostración">
      <div className="demo-barra-grupo" role="tablist" aria-label="Qué mostrar">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "dual"}
          data-testid={DEMO.modoDual}
          onClick={() => handleToggleMode("dual")}
          className={`device-preview-toolbar-btn ${mode === "dual" ? "device-preview-btn-active" : "device-preview-btn-ghost"}`}
          title="Ver la app del chofer y la del pasajero lado a lado"
        >
          <SplitSquareVertical size={14} />
          <span>Modo Dual</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "mobile" && isOperadorPath}
          data-testid={DEMO.appOperador}
          onClick={() => verSolo("/operador")}
          className={`device-preview-toolbar-btn ${mode === "mobile" && isOperadorPath ? "device-preview-btn-active" : "device-preview-btn-ghost"}`}
          title="Mostrar solo la app del chofer"
        >
          <Car size={14} />
          <span>App Operador</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "mobile" && isPasajeroPath}
          data-testid={DEMO.appPasajero}
          onClick={() => verSolo("/pasajero")}
          className={`device-preview-toolbar-btn ${mode === "mobile" && isPasajeroPath ? "device-preview-btn-active" : "device-preview-btn-ghost"}`}
          title="Mostrar solo la app del pasajero"
        >
          <User size={14} />
          <span>App Pasajero</span>
        </button>
      </div>

      <div className="demo-barra-grupo">
        {anyMoved && (
          <button
            type="button"
            data-testid={DEMO.centrar}
            onClick={resetAllPositions}
            className="device-preview-toolbar-btn device-preview-btn-ghost"
            title="Regresar los celulares a su lugar"
          >
            <RotateCcw size={12} />
            <span>Centrar</span>
          </button>
        )}
        {!isPopup && (
          <button
            type="button"
            data-testid={DEMO.pantallaCompleta}
            onClick={() => handleToggleMode("fullscreen")}
            className="device-preview-toolbar-btn device-preview-btn-ghost"
            title="Usar la app a pantalla completa del navegador"
          >
            <Maximize2 size={13} />
            <span>Pantalla completa</span>
          </button>
        )}
        {!isPopup && (
          <button
            type="button"
            data-testid={DEMO.popup}
            onClick={handleOpenPopupWindow}
            className="device-preview-toolbar-btn device-preview-btn-ghost"
            title="Abrir en una ventana aparte (ideal para grabar)"
          >
            <ExternalLink size={13} />
            <span>Pop-up</span>
          </button>
        )}
      </div>
    </nav>
  );

  // VISTA EN MODO DUAL (Ambos celulares lado a lado: Conductor + Pasajero)
  if (mode === "dual") {
    return (
      <div className="device-preview-backdrop demo-escenario">
        {barra}
        <DemoEncabezado vista="dual" />
        <div className="device-preview-dual-container">
          <DemoFunciones titulo="App del chofer" items={FUNCIONES_CHOFER} lado="izquierda" />

          {/* CELULAR 1: CONDUCTOR (OPERADOR) */}
          <div className="device-preview-dual-item">
            <PhoneChassis
              title="Mover"
              badge="App del chofer"
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
              title="Mover"
              badge="App del pasajero"
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

          <DemoFunciones titulo="App del pasajero" items={FUNCIONES_PASAJERO} lado="derecha" />
        </div>
        <DemoPie />
      </div>
    );
  }

  // VISTA DE UNA SOLA APP (la elegida en la barra)
  if (mode === "mobile" || isPopup) {
    const esPasajero = vista === "pasajero";
    return (
      <div className="device-preview-backdrop demo-escenario">
        {barra}
        <DemoEncabezado vista={vista} />
        <div className="device-preview-dual-container">
          <DemoFunciones
            titulo={esPasajero ? "App del pasajero" : "App del chofer"}
            items={esPasajero ? FUNCIONES_PASAJERO : FUNCIONES_CHOFER}
            lado="izquierda"
          />
          <div className="device-preview-dual-item">
            <PhoneChassis
              title="Mover"
              badge={esPasajero ? "App del pasajero" : "App del chofer"}
              badgeType={esPasajero ? "passenger" : "driver"}
              phoneTime={phoneTime}
              dragOffset={singleDrag.offset}
              onDragStart={singleDrag.onDragStart}
            >
              {children}
            </PhoneChassis>
          </div>
        </div>
        <DemoPie />
      </div>
    );
  }

  // VISTA EN PANTALLA COMPLETA
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Botones flotantes superiores para volver a la demostración */}
      <div className="device-preview-fullscreen-floating">
        <button
          type="button"
          data-testid={DEMO.modoDual}
          onClick={() => handleToggleMode("dual")}
          className="device-preview-toolbar-btn device-preview-btn-ghost"
          title="Ver ambos celulares lado a lado"
        >
          <SplitSquareVertical size={14} />
          <span>Modo Dual</span>
        </button>
        <button
          type="button"
          data-testid={DEMO.appOperador}
          onClick={() => verSolo("/operador")}
          className="device-preview-toolbar-btn device-preview-btn-ghost"
          title="Mostrar solo la app del chofer"
        >
          <Car size={13} />
          <span>App Operador</span>
        </button>
        <button
          type="button"
          data-testid={DEMO.appPasajero}
          onClick={() => verSolo("/pasajero")}
          className="device-preview-toolbar-btn device-preview-btn-ghost"
          title="Mostrar solo la app del pasajero"
        >
          <User size={13} />
          <span>App Pasajero</span>
        </button>
      </div>

      {/* Contenido completo de la app */}
      {children}
    </div>
  );
}

export default DevicePreviewWrapper;
