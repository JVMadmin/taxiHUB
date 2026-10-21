# AGENTS.md

## Overview
Taxi dispatch platform: a FastAPI + MongoDB (motor) backend and a React SPA frontend that builds five apps from one codebase: **Terminal** (central/dispatch, real-time Leaflet map), **Operador** (driver), **Pasajero** (passenger), **Socio/Dueño** (fleet owner) and the public **Landing** (`taxihub.cloud`). Android apps are packaged with Capacitor. Dark theme. Spanish UI strings throughout — keep user-facing text in Spanish.

Production (`https://taxihub.cloud`) currently runs as a **demo**: a simulated fleet (34 drivers, GPS patrol over real Palenque streets) is seeded at startup. Keep the simulation working unless the user says otherwise.

## Layout
- `backend/server.py` (~3k lines) — app setup, storage helpers, auth dependencies (`require_*`), Pydantic models, `ConnectionManager`, the GPS pipeline + geofence, the dispatch engine (`_buscar_candidatos`, `_asignar_atomicamente`, autodespacho, cascade/retry loops), routing/geo, `_migraciones`, startup and the router wiring. Route prefix `/api`.
- `backend/*_module.py` — one router per area, each a factory (`build_router(...)`, or `build(...)` returning a namespace when `server.py` must re-export functions) that receives its dependencies as keyword arguments and `db=_db_proxy` (resolves `server.db` on every access so the tests' monkeypatch keeps working): `auth`, `operadores`, `turnos` (shifts + fuel), `clientes`, `catalogos` (vehicle types, vehicles, routes, colonias, tarifas), `servicios`, `reportes` (+ `/files`), `chat`, `dueno`, `sitio` (photos, logos, site config), `dev`, `whatsapp`, `websockets`, `simulacion` (seed + GPS patrol; data in `simulacion_datos.py`), plus `mantenimiento`, `socios_extra`, `terminal_consulta`. Module routers are included after `api_router`, so route order matters: keep a parametrized path (`/x/{id}`) in the same router as, and after, the literal paths it could shadow; `dueno_module` is included before `socios_extra_module` because both define `/dueno/notificaciones` and `/dueno/conductores`. Code that reads a module global the tests monkeypatch (`ROUTING_PROVIDER_URL`) stays in `server.py`.
- Mongo collections in use include `operadores`, `vehiculos`, `tipos_vehiculo`, `clientes`, `servicios`, `rutas`, `colonias`, `tarifas_predefinidas`, `turnos`, `combustible_cargas`, `reportes_objetos`, `mensajes_chat`, `wa_conversaciones`, `usuarios_terminal`, `usuarios_dueno`, `sitios`, `config`, `archivos`, plus owner/maintenance collections.
- `backend/app/db.py` + `migrations/` — Postgres/SQLAlchemy scaffolding that is **not used** by the running app yet.
- `frontend/` — Create React App **via CRACO** (`craco start/build/test`). Path alias `@` → `src`. Tailwind + shadcn/ui + Leaflet. App selection in `src/App.js` (`REACT_APP_APP_MODE`, `?app=`, native platform).
- `frontend/public/assets/drivers/` — demo driver portraits (Pexels stock, see `CREDITS.md`), assigned by gender in `simulacion_datos.py` (`FOTOS_DEMO_HOMBRES` / `FOTOS_DEMO_MUJERES`, re-exported by `server.py`). Never use photos of public figures.
- `memory/PRD.md` — feature/phase history; `docs/` — per-phase design docs and `DEPLOYMENT.md`.
- `CLAUDE_HANDOFF.md` (root, gitignored) — VPS access and production credentials. **The GitHub repo is public**: never commit hosts, keys, passwords or that file.

## Backend
- Env: `server.py` loads `backend/.env` (gitignored). `MONGO_URL` (`memory` = in-memory mongomock), `DB_NAME`, `JWT_SECRET` (mandatory and non-default when `ENV=production`, otherwise startup fails), `CORS_ORIGINS`, `DEV_USER`, `DEV_PASSWORD`, `WA_WEBHOOK_TOKEN` (WhatsApp bridge → `/api/wa/incoming` and `/api/wa/webhook`), `SIMULACION_DEMO` (default `1`), `DESPACHO_PRIORIDAD_USUARIO` (default `op1`; empty disables the demo priority driver).
- Run: `uvicorn server:app --reload` (from `backend/`). The frontend dev env (`frontend/.env.development`) expects the API on `127.0.0.1:8001`.
- Auth: JWT scopes `operador`, `terminal`, `pasajero`, `dueno`, `dev`; every token carries `sitio_id` (tenant). Dev panel at `/dev` validates against `DEV_USER`/`DEV_PASSWORD`.
- Dispatch: passenger requests are auto-offered to one driver at a time (`_autodespachar_servicio_pasajero`), cascading after `config.oferta_duracion_seg`; pending passenger trips are retried every 10 s and expire after `config.pendiente_max_minutos`. Assignment reserves the driver atomically (`_asignar_atomicamente`). Candidates need fresh GPS (`config.gps_stale_seconds`) or a live operator WebSocket.
- Lint/format deps installed (`black`, `isort`, `flake8`, `mypy`) but there is **no** configured command/script.
- Real-time via the in-file `ConnectionManager` (terminal broadcast per sitio + per-operador/pasajero/dueño websockets). Background loops (cascade, GPS patrol) run in-process: run a **single** uvicorn worker.
- File uploads are stored on local disk in `backend/uploads/` (`put_object`/`get_object`), served via `GET /api/files/{path}`.

## Frontend
- `frontend/src/lib/api.js` — API client. `BACKEND_URL` from `REACT_APP_BACKEND_URL` (or `localStorage.th_backend_url`); JWT per app in localStorage (`op_token`, `pas_token`, …). WS base derived from the same URL.
- Theme/palette via `data-theme` in localStorage; app root is forced `dark`.
- E2E testability: interactive elements get `data-testid` values, centralized in `frontend/src/constants/testIds/` (one file per feature, re-exported from `index.js`). Value convention is kebab-case `<feature>-<element>`. Add new test IDs there when adding UI; do not inline raw strings in JSX (many legacy inline ones remain).
- Capacitor 8 everywhere (`core`, `android`, `cli` and the official plugins): keep them on the same major when upgrading. `scripts/build_all_apks.py` builds the three APKs (driver, passenger, owner) with `cap sync` + `gradlew assembleDebug -PappId=…`.

## Testing (important)
- **Do not modify `backend/pytest.ini` `addopts`** — keep exactly `-n 2 --dist loadscope` (pytest-xdist is a required plugin). Serial run = `-n 0` (NOT `-p no:xdist`, which errors).
- Run from `backend/`: `python -m pytest -q`. With freshly installed packages pytest may wrongly report the required plugins as missing; add `-o required_plugins=` (do not edit the ini).
- Suites live in `tests/` (backend, mongomock, ~100 tests); generated suites appear under `test_reports/`. A `-n`/`--dist` custom option in your own test code will collide with xdist's — rename it.
- `test_result.md` contains the required agent testing protocol. Preserve the `#===`-delimited block verbatim and update the YAML data (status_history, test_plan, needs_retesting) per that protocol; it's the handoff channel for the testing agent.

## Deploy
- Use `scripts/deploy_vps.sh` (see `docs/DEPLOYMENT.md`): tests → `git archive HEAD` → rebuild and recreate only `taxihub-backend` and `taxihub-frontend`. Run `--revisar` (read-only) first. Do not `docker cp` into containers.
- `/usr/share/nginx/html/downloads/` in `taxihub-frontend` holds the APKs and the Windows installer (volume `taxihub_downloads`): never delete or overwrite it.
- The VPS hosts other projects (Caddy `nexium-caddy`, other apps): never restart or modify containers that are not `taxihub-*`. Confirm every production action with the user.

## Package manager
- Frontend uses **yarn** (packageManager pinned yarn@1.22.22); use `yarn` not npm for installs. Backend uses pip with `backend/requirements.txt`.
