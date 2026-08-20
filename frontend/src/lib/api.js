import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const WS_BASE = BACKEND_URL.replace(/^http/, "ws") + "/api";

// Cinco superficies autenticadas (cada una con su propio JWT):
//  - api      -> operador (op_token)
//  - termApi  -> terminal  (term_token)
//  - devApi   -> desarrollador (dev_token)
//  - pasApi   -> pasajero (pas_token)
//  - duenoApi -> dueño de flota (dueno_token)
const mk = (getToken, on401) => {
  const c = axios.create({ baseURL: API });
  c.interceptors.request.use((config) => {
    const t = getToken();
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
  });
  if (on401) {
    c.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err.response?.status === 401) on401(err);
        return Promise.reject(err);
      }
    );
  }
  return c;
};

const opToken = () => localStorage.getItem("op_token");
const termToken = () => localStorage.getItem("term_token");
const devToken = () => localStorage.getItem("dev_token");
const pasToken = () => localStorage.getItem("pas_token");
const duenoToken = () => localStorage.getItem("dueno_token");

export const api = mk(opToken);
export const termApi = mk(termToken);
export const devApi = mk(devToken);
export const pasApi = mk(pasToken, () => {
  localStorage.removeItem("pas_token");
  localStorage.removeItem("pas_data");
  window.location.reload();
});
export const duenoApi = mk(duenoToken);

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
export const saveDevAuth = (token) => localStorage.setItem("dev_token", token);
export const getDevToken = () => localStorage.getItem("dev_token");
export const logoutDev = () => localStorage.removeItem("dev_token");
export const savePassengerAuth = (token, cliente) => {
  localStorage.setItem("pas_token", token);
  localStorage.setItem("pas_data", JSON.stringify(cliente));
};
export const getPassenger = () => {
  const d = localStorage.getItem("pas_data");
  return d ? JSON.parse(d) : null;
};
export const logoutPassenger = () => {
  localStorage.removeItem("pas_token");
  localStorage.removeItem("pas_data");
};
export const saveDuenoAuth = (token, usuario) => {
  localStorage.setItem("dueno_token", token);
  localStorage.setItem("dueno_data", JSON.stringify(usuario));
};
export const getDuenoToken = () => localStorage.getItem("dueno_token");
export const getDueno = () => {
  const d = localStorage.getItem("dueno_data");
  return d ? JSON.parse(d) : null;
};
export const logoutDueno = () => {
  localStorage.removeItem("dueno_token");
  localStorage.removeItem("dueno_data");
};

export const ESTADO_COLORS = {
  libre: "#22c55e",
  ocupado: "#ef4444",
  no_disponible: "#eab308",
  fuera_de_servicio: "#6b7280",
  averiado: "#a855f7",
};

export const ESTADO_LABEL = {
  libre: "Libre",
  ocupado: "Ocupado",
  no_disponible: "No disponible",
  fuera_de_servicio: "Fuera de servicio",
  averiado: "Averiado",
};

export const SERVICIO_COLORS = {
  pendiente: "#eab308",
  ofrecido: "#3b82f6",
  asignado: "#8b5cf6",
  en_curso: "#22c55e",
  completado: "#10b981",
  cancelado: "#ef4444",
  vencido: "#f97316",
  rechazado: "#6b7280",
};

export const SERVICIO_LABEL = {
  pendiente: "Pendiente",
  ofrecido: "Oferta enviada",
  asignado: "Asignado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
  vencido: "Vencido",
  rechazado: "Rechazado",
};
