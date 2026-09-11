import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined
  ? process.env.REACT_APP_BACKEND_URL
  : (typeof window !== "undefined" && ["3000", "3080", "5173", "3001"].includes(window.location.port)
      ? `http://${window.location.hostname}:8080`
      : "");
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export const WS_BASE = BACKEND_URL
  ? BACKEND_URL.replace(/^http/, "ws") + "/api"
  : (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api`
      : "/api");

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

// Estados: fuente única de verdad en src/design/status.js (TaxiHUB 2.0).
// Se re-exportan con los nombres históricos para no romper consumidores.
import { ESTADOS_OPERADOR, ESTADOS_SERVICIO } from "@/design/status";

export const ESTADO_COLORS = Object.fromEntries(
  Object.entries(ESTADOS_OPERADOR).map(([k, v]) => [k, v.color])
);

export const ESTADO_LABEL = Object.fromEntries(
  Object.entries(ESTADOS_OPERADOR).map(([k, v]) => [k, v.label])
);

export const SERVICIO_COLORS = Object.fromEntries(
  Object.entries(ESTADOS_SERVICIO).map(([k, v]) => [k, v.color])
);

export const SERVICIO_LABEL = Object.fromEntries(
  Object.entries(ESTADOS_SERVICIO).map(([k, v]) => [k, v.label])
);
