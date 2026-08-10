import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const WS_BASE = BACKEND_URL.replace(/^http/, "ws") + "/api";

export const api = axios.create({ baseURL: API });

// Adjunta el token JWT del operador si existe
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("op_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export const saveAuth = (token, operador) => {
  localStorage.setItem("op_token", token);
  localStorage.setItem("op_data", JSON.stringify(operador));
};
export const getToken = () => localStorage.getItem("op_token");
export const getOperador = () => {
  const d = localStorage.getItem("op_data");
  return d ? JSON.parse(d) : null;
};
export const logoutOperador = () => {
  localStorage.removeItem("op_token");
  localStorage.removeItem("op_data");
};

export const ESTADO_COLORS = {
  libre: "#22c55e",
  ocupado: "#ef4444",
  no_disponible: "#eab308",
  fuera_de_servicio: "#6b7280",
};

export const ESTADO_LABEL = {
  libre: "Libre",
  ocupado: "Ocupado",
  no_disponible: "No disponible",
  fuera_de_servicio: "Fuera de servicio",
};
