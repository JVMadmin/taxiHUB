const THEMES = {
  esmeralda: { label: "Esmeralda", swatch: "#10b981" },
  oceano: { label: "Océano", swatch: "#3b82f6" },
  ambar: { label: "Ámbar", swatch: "#f59e0b" },
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