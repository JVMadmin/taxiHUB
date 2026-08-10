const THEMES = {
  esmeralda: { label: "Esmeralda", swatch: "#10b981" },
  oceano: { label: "Océano", swatch: "#3b82f6" },
  ambar: { label: "Ámbar", swatch: "#f59e0b" },
};

export const THEME_LIST = Object.entries(THEMES).map(([id, v]) => ({ id, ...v }));

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
