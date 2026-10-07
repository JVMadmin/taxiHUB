const THEMES = {
  esmeralda: { label: "Esmeralda", swatch: "#10b981" },
  oceano: { label: "Océano", swatch: "#3b82f6" },
  ambar: { label: "Ámbar", swatch: "#f59e0b" },
  rubi: { label: "Rubí", swatch: "#f43f5e" },
  violeta: { label: "Violeta", swatch: "#8b5cf6" },
};

export const THEME_LIST = Object.entries(THEMES).map(([id, v]) => ({ id, ...v }));

// Modos de apariencia. "oscuro" = predeterminado (sin atributo, idéntico al
// look heredado). "claro" = piel diurna "papel cálido".
export const MODE_KEYS = ["oscuro", "claro"];

export function applyTheme(id) {
  const theme = THEMES[id] ? id : "esmeralda";
  // esmeralda = default (sin atributo) para no alterar el look actual
  if (theme === "esmeralda") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem("app_theme", theme);
}

export function getTheme() {
  return localStorage.getItem("app_theme") || "esmeralda";
}

// Convierte HEX (#rrggbb) a HSL "H S% L%" para variables CSS --brand
function hexToHslTuple(hex) {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Aplica la identidad visual del sitio (tema y/o color primario personalizado)
 * configurada desde el Panel de Desarrollador (/dev).
 */
export function applySitioBranding(cfg) {
  if (!cfg) return;
  if (cfg.tema_default && THEMES[cfg.tema_default] && !localStorage.getItem("app_theme_user_override")) {
    applyTheme(cfg.tema_default);
  }
  if (cfg.color_primario) {
    const hsl = hexToHslTuple(cfg.color_primario);
    if (hsl) {
      const root = document.documentElement;
      root.style.setProperty("--brand", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
      root.style.setProperty("--brand-bright", `${hsl.h} ${Math.min(100, hsl.s + 10)}% ${Math.min(85, hsl.l + 8)}%`);
      root.style.setProperty("--brand-strong", `${hsl.h} ${hsl.s}% ${Math.max(25, hsl.l - 10)}%`);
    }
  }
}

// ---------- Modo de apariencia (oscuro / claro) ----------

export function applyMode(mode) {
  const m = mode === "claro" ? "claro" : "oscuro";
  if (m === "claro") {
    document.documentElement.setAttribute("data-mode", "claro");
  } else {
    document.documentElement.removeAttribute("data-mode");
  }
  localStorage.setItem("app_mode", m);
  window.dispatchEvent(new CustomEvent("app:mode", { detail: m }));
}

export function getMode() {
  return localStorage.getItem("app_mode") === "claro" ? "claro" : "oscuro";
}