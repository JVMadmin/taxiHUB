# FASE 7 — SOCIOS (ficha 360° + rendimiento)

> Estado: implementada y validada — 53/53 tests (5 nuevos de socios), build OK, captura de la ficha operando.

## 1. Corrección estructural (hallazgo de la auditoría P1)

**Problema**: los routers de los módulos (`mantenimiento_module`, `socios_extra_module`)
capturaban `db` por referencia en import-time. Eso:
- rompía los tests con mongomock (monkeypatch de `server.db` no llegaba a los módulos — 11 endpoints sin posibilidad de test),
- bloqueaba reconexión en caliente.

**Solución**: `_DbProxy` en server.py — delega en `db` en cada acceso. Los módulos siguen
recibiendo el mismo contrato (factory), pero ahora siempre ven el `db` vigente.
Resultado: los 11 endpoints de módulos pasaron a ser testeables.

## 2. Refactor de rendimiento (N+1 eliminados)

| Endpoint | Antes | Ahora |
|---|---|---|
| `GET /dueno/reparto/calculo` | socios×vehículos queries de hasta 500 docs | 1 query con `$in` + suma en memoria, filtro por `timestamp_fin` del mes (antes: regex sobre campo inexistente `completado_en` — bug corregido) |
| `GET /dueno/conductores` | 2 count_documents por conductor | 1 query `$in` con conteo en memoria (mes con prefijo ISO correcto) |

## 3. Ficha de socio: `GET /api/dueno/ficha` (nuevo)

Respuesta única 360° del socio autenticado (`require_dueno`):
- `socio` — identidad
- `flota.total` + `flota.estados` (disponibles/ocupadas/pausadas/offline/averiadas — §19 del prompt)
- `flota.vehiculos[]` — unidad, vehículo, conductor, estado, último mantenimiento, documentos
- `conductores[]` — nombre, teléfono, estado, unidad asignada
- `mes` — servicios completados/cancelados e ingresos del mes actual
- `alertas` — documentos vencidos y por vencer (30 días)

Costo: 1 consulta por colección (vehículos, operadores, servicios, mantenimientos, documentos) — sin N+1.

## 4. Frontend: vista "Socios" en el panel del dueño

- Nueva sección **Socios** (segunda posición, ícono handshake) en `DuenoApp`.
- KPIs: unidades, servicios del mes, cancelados, ingresos del mes (KPICard del sistema).
- Estados de flota con colores SSOT (`design/status`).
- Tabla de flota (unidad/vehículo/conductor/estado/últ. mantenimiento/documentos) con `th-table`.
- Cards de conductores con iniciales, unidad y estado.
- Banner de alertas documentales cuando aplica.
- "Reparto" se conserva (no-regresión), con ícono Receipt para no duplicar Handshake.
- `data-testid`: `dueno-socios`, `socios-alertas`, `socios-flota-table`, `socios-conductores`.

## 5. Seguridad (multi-tenant §35)
- La ficha deriva TODO desde `_vehiculos_de_dueno` (ownership por `propietario_id`) —
  un socio jamás ve unidades/conductores/servicios de otro.
- Test de aislamiento explícito: socio A ve AA-001, socio B ve BB-001.
- Token de operador → 401/403 en la ficha.

## 6. Validación
- `tests/test_socios.py` (5 tests, escritos junto al backend): ficha agrega todo,
  aislamiento entre socios, scope requerido, reparto sin N+1 con montos correctos,
  conteos de conductores.
- Regresión completa: **53/53** en 101 s (xdist -n 2).
- Captura E2E: ficha del socio con flota (SD-001), estados, conductor Jorge Pérez.
