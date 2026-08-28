# PREMIUM FASE 5 — WHATSAPP ESTILO WHATSAPP WEB

> Estado: implementado y validado — 79/79 tests, build OK, E2E del flujo completo
> mensaje → ubicación → taxis cercanos → ASIGNAR (con capturas).

## 1. Panel expandido a dos columnas
- Al abrir WhatsApp el panel derecho crece de 400 → **720 px** (transición suave);
  el rail se recorre dinámicamente (`right: calc(720px + 12px)`).
- Fix de layout: el contenedor vacío de otras secciones consumía la mitad del
  panel (flex-1 × 2) — ahora se excluye cuando WhatsApp está activo.

## 2. Lista de conversaciones (estilo WhatsApp Web)
- **Búsqueda** por nombre/teléfono (`wa-buscar`).
- Avatar con iniciales, último mensaje (📍 si trae ubicación), timestamp relativo.

## 3. Chat
- **Encabezado** con avatar, nombre, teléfono y conteo de mensajes.
- Burbujas: cliente (izquierda, superficie) / operadora (derecha, marca).
- **UBICACIÓN RECIBIDA** con coordenadas + dos acciones:
  - **[Ver en mapa]** → vuela al punto + pin persistente (sin formularios, §47).
  - **[+ Crear servicio]** → **TAXIS MÁS CERCANOS** inline.

## 4. TAXIS MÁS CERCANOS (§16) — la operadora decide
- Calcula distancia haversine de los **taxis libres** a la ubicación recibida,
  ordena y muestra top 4: `1 · TX-101 · Carlos Ramírez · 24.1 km · [ASIGNAR]`.
- **[ASIGNAR]** = crea el servicio (origen = ubicación WhatsApp, cliente de la
  conversación) **y asigna** a esa unidad en un solo toque — decisión explícita
  de la operadora, sin autoasignación.
- **"Abrir formulario completo…"** para el flujo tradicional con destino/notas.
- Si no hay taxis libres: mensaje vacío claro.

## 5. Validación E2E (capturas p5_1/2/3)
1. Conversación de María López abierta con su ubicación.
2. "Crear servicio" → TAXIS MÁS CERCANOS: TX-101 · Carlos Ramírez · 24.1 km.
3. ASIGNAR → toast "Servicio asignado a TX-101", contadores 0 disp/1 ocupado,
   servicio #760CE3 en Asignado con origen "Ubicación de WhatsApp".

Bug corregido en el camino: `ServicioCreate.destino` es requerido (422) —
el panel ahora envía `destino: {}` (igual que ServicioModal).

## 6. data-testids
`wa-buscar`, `wa-conversacion`, `wa-chat`, `wa-mensajes`, `wa-ver-mapa`,
`wa-marcar-mapa`, `wa-cercanos`, `wa-asignar-{operador_id}`,
`wa-formulario-completo`, `wa-volver`, `wa-respuesta`, `wa-enviar`.
