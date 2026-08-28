# PREMIUM FASE 6 — DESPACHO PASO A PASO (Nueva llamada)

> Estado: implementado y validado — 79/79 tests, build OK, E2E con clics reales en el mapa
> y asignación completa (capturas p6_1/p6_2).

## 1. DespachoModal (`components/ops/DespachoModal.jsx`)
Reemplaza al formulario administrativo por un **centro de despacho** (§17):

| Paso | Contenido | Regla |
|---|---|---|
| 1 ¿Dónde está el servicio? | Buscador geográfico (/geo/search) + **Marcar en mapa** (banner + clic) | Obligatorio — gatea el paso 4 |
| 2 Destino | Mismos mecanismos, con "quitar" | Opcional |
| 3 Datos del cliente | Cliente + teléfono, **colapsado por defecto** | Secundario (§17) |
| 4 Taxis libres más cercanos | Top 6 por distancia haversine: placa, conductor, vehículo, distancia + **[Asignar]** | La operadora decide; sin autoasignación |

- **[Asignar]** = crear servicio (origen/destino/cliente) + asignar a esa unidad — un toque.
- Coordenadas visibles junto al paso 1 para contexto.
- Vivos en el mapa: pin Origen (verde) y Destino (rojo) mientras se marca.

## 2. Integración
- "Nueva llamada" (topbar, dock móvil, rail) abre DespachoModal.
- MapSearch (buscador global) prefill origen/destino del despacho.
- WhatsApp "Abrir formulario completo…" también desemboca aquí (pre-prefill).
- `servicioForm` simplificado (solo cliente); picking/banners reutilizados.
- ServicioModal queda sin uso en Terminal (archivo intacto por si se reutiliza).

## 3. Validación E2E (clics reales con CDP)
1. Nueva llamada → Marcar origen → clic real en el mapa (coords capturadas ✓).
2. Marcar destino → clic real (✓) con banner de picking.
3. Lista poblada: TX-101 · Carlos Ramírez · Nissan March · 25.8 km · [Asignar].
4. Asignar → toast "Servicio asignado a TX-101", contadores 0 disp / 1 ocupado,
   pins Origen/Destino visibles en el mapa.

## 4. data-testids
`despacho-overlay`, `despacho-origen`, `despacho-destino`, `despacho-cliente`,
`despacho-taxis`, `despacho-marcar-origen/destino`, `despacho-asignar-{operador_id}`,
`despacho-cliente`, `despacho-telefono`, `despacho-cancelar` (X), `mant-*` intactos.
