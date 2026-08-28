# FASE 4 — NUEVA LLAMADA / MAPSEARCH / WHATSAPP

> Estado: implementada y validada (build OK, 32/32 tests, capturas de flujo real).

## 1. Buscador geográfico global (MapSearch)

### Backend (server.py)
- `GET /api/geo/search?q=&limit=` — proxy de geocoding sobre **Photon (komoot)**,
  autenticado (cualquier rol activo). Sesgo a la zona de operación vía `bbox`
  configurable con `map_center_lat/lng` de la colección `config` (defaults a Palenque).
  - Entorno nuevo: `GEOCODING_PROVIDER_URL` (default `https://photon.komoot.io`),
    `GEOCODING_TIMEOUT_SECONDS` (default 6).
  - Hallazgo documentado: la instancia pública de Photon **rechaza `lang` (HTTP 400)**
    — se omite. Requiere `User-Agent` propio (403 sin él).
  - Salida normalizada: `{id, label, sublabel, lat, lng, tipo}`.

### Frontend (`src/components/maps/MapSearch.jsx`)
- Debounce 350 ms, mínimo 3 caracteres, dropdown con iconografía por tipo de POI.
- Al elegir: `flyTo` al punto (GotoController nuevo en Terminal) + marcador azul
  de referencia + acciones **Usar como origen / Usar como destino** que prefill
  el modal de nueva llamada con coordenadas y texto.
- `data-testid`: `map-search`, `map-search-input`, `map-search-results`,
  `map-search-result`, `map-search-usar-origen/destino`, `map-search-actions`.

Verificado contra casos reales del prompt: «Pakal-Na» → Estación Pakal-Ná;
«5a Avenida Norte» → avenidas de Palenque; «Hospital» → Hospital General de Palenque.

## 2. Panel WhatsApp (arquitectura preparada, sin hacks)

### Backend (server.py)
- Colección `wa_conversaciones`: `{cliente_nombre, cliente_telefono, mensajes[], creada_en, actualizada_en}`.
  Mensajes: `{de: cliente|operadora, texto, ts, lat?, lng?}`.
- Endpoints (todos `require_terminal`):
  - `GET /wa/conversaciones` (lista ordenada con último mensaje)
  - `GET /wa/conversaciones/{id}` (hilo completo)
  - `POST /wa/conversaciones/{id}/reply` (respuesta de la operadora — trazabilidad; en
    producción la entregará el proveedor oficial)
  - `POST /wa/webhook` — **FUTURO**: entrada de eventos del proveedor oficial.
    Sin `WA_WEBHOOK_TOKEN` configurado responde **503** (no simula integración
    inexistente). Con token, hace upsert por teléfono y acepta texto o lat/lng.
- Seed: conversación demo (María López) con ubicación incluida.

### Frontend (`src/components/WhatsAppPanel.jsx` + sección en TerminalMenu)
- Bandeja → hilo de chat con burbujas cliente/operadora.
- Mensaje con ubicación → botón **MARCAR EN MAPA**.
- Flujo completo validado con capturas: marcar → mapa vuela al punto → modal
  "Nueva llamada" abierto con cliente, teléfono y origen "Ubicación de WhatsApp"
  con coordenadas ya colocadas → la operadora completa destino y asigna manualmente.
- `data-testid`: `wa-lista`, `wa-conversacion`, `wa-chat`, `wa-mensajes`,
  `wa-marcar-mapa`, `wa-volver`, `wa-respuesta`, `wa-enviar`.

## 3. Lo que NO se hizo (deliberado, según prompt)
- No se automatizó WhatsApp Web ni scraping.
- No existe autoasignación: el flujo termina en el modal donde la operadora decide.

## 4. Validación
- `yarn build` OK; 32/32 tests backend OK.
- E2E con CDP: login → abrir WhatsApp → conversación → marcar en mapa → modal
  prefill correcto (capturas `wa_1/2/3.png`).
- `/api/geo/search` probado con 3 queries reales.
