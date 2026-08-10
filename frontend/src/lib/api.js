import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const WS_BASE = BACKEND_URL.replace(/^http/, "ws") + "/api";

export const api = axios.create({ baseURL: API });

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
