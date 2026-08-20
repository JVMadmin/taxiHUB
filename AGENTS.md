# AGENTS.md

## Overview
Taxi dispatch platform: a FastAPI + MongoDB (motor) backend and a React SPA frontend. Two UIs: the **Terminal** (admin/despatch, real-time Leaflet map) and the **Operador** (driver) app. Dark theme. Spanish UI strings throughout — keep user-facing text in Spanish.

## Layout
- `backend/server.py` — the entire API in one file (all routes, models, WebSockets, storage helpers). Route prefix `/api`. Collections: `operadores`, `clientes`, `rutas`, `servicios`, `reportes_objetos`, `mensajes_chat`, `usuarios_terminal`, `tarifas_predefinidas`, `config`, `archivos`.
- `frontend/` — Create React App **via CRACO** (`craco start/build/test`). Path alias `@` → `src`. Tailwind + shadcn/ui + Leaflet.
- `memory/PRD.md` — authoritative feature/phase history. `memory/test_credentials.md` is gitignored (created per-env).

## Backend
- Env: `server.py` loads `backend/.env` (gitignored). Required: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`. Also used: `CORS_ORIGINS`, `DEV_USER`, `DEV_PASSWORD`. Do not commit secrets.
- Run: `uvicorn server:app --reload` (from `backend/`).
- Auth: two JWT schemes — operador (`/auth/login`) and terminal (`/terminal/login`, token has `scope: "terminal"`). Dev panel at `/dev` (frontend `DevPanel.jsx`); its login validates against `DEV_USER`/`DEV_PASSWORD` env vars — there is no hardcoded default.
- Lint/format deps installed (`black`, `isort`, `flake8`, `mypy`) but there is **no** configured command/script — run them manually if you change Python; do not assume a `lint` target exists.
- Real-time via the in-file `ConnectionManager` (terminal broadcast + per-operador websockets). State/ubicacion/servicio/reporte/mensaje events pushed over these sockets.
- File uploads (fotos de reportes, perfil y logo) se guardan en disco local en `backend/uploads/` (`put_object`/`get_object`) y se sirven vía `GET /api/files/{path}`.

## Frontend
- `frontend/src/lib/api.js` — API client. `BACKEND_URL` comes from `REACT_APP_BACKEND_URL`; JWT read from `localStorage("op_token")`. WS base derived from the same URL.
- Theme/palette via `data-theme` in localStorage; app root is forced `dark`.
- E2E testability: interactive elements get `data-testid` values, centralized in `frontend/src/constants/testIds/` (one file per feature, re-exported from `index.js`). Value convention is kebab-case `<feature>-<element>`. Add new test IDs there when adding UI; do not inline raw strings in JSX.

## Testing (important)
- **Do not modify `backend/pytest.ini` `addopts`** — keep exactly `-n 2 --dist loadscope` (pytest-xdist is a required plugin). Serial run = `-n 0` (NOT `-p no:xdist`, which errors).
- `tests/` is currently empty (`__init__.py` only); generated suites appear under `test_reports/`. A `-n`/`--dist` custom option in your own test code will collide with xdist's — rename it.
- `test_result.md` contains the required agent testing protocol. Preserve the `#===`-delimited block verbatim and update the YAML data (status_history, test_plan, needs_retesting) per that protocol; it's the handoff channel for the testing agent.

## Package manager
- Frontend uses **yarn** (packageManager pinned yarn@1.22.22); use `yarn` not npm for installs. Backend uses pip with `backend/requirements.txt`.