# FASE 8 — EXPEDIENTES DE CONDUCTOR

> Estado: implementada y validada — 58/58 tests (5 nuevos), build OK, captura E2E del expediente con estados documentales reales.

## 1. Backend (socios_extra_module.py)

### Colección nueva: `documentos_conductor`
```js
{ operador_id, tipo, numero?, vence_en (YYYY-MM-DD), actualizado_en }
```
Tipos normativos: `licencia`, `ine`, `seguro` (configurables exteniendo `TIPOS_DOC_CONDUCTOR`).

### Endpoints (todos `require_dueno`)
| Endpoint | Función |
|---|---|
| `POST /dueno/conductores/{id}/documentos` | Upsert por (operador, tipo) — no duplica; devuelve estado calculado |
| `GET /dueno/conductores/{id}/documentos` | Lista con estados de vigencia |
| `GET /dueno/conductores/{id}` | **Expediente 360°**: conductor + unidad + documentos con estado + alertas + servicios del mes + turno activo + fecha de ingreso |

### Estados de vigencia (§20 del prompt)
- `vigente` (>30 días), `por_vencer` (≤30 días), `vencido` (≤0), `faltante` (sin registro).
- El cálculo vive en el backend (autoritativo); el frontend solo lo pinta.

### Seguridad (§20 — backend, no solo frontend)
- `_operador_de_dueno_o_404`: el expediente solo es visible si la unidad del conductor
  tiene `propietario_id` = socio autenticado. Otro socio → **404** (no revela existencia).
- Taxista/terminal no tienen acceso a la ruta (scope dueno exclusivo).
- Test de aislamiento explícito con socio intruso.

## 2. Frontend
- **Conductores**: ahora las cards son clickeables → navegan al expediente (chevron indica acción).
- **Expediente.jsx** (nueva vista): cabecera con foto/iniciales, nombre, teléfono, unidad, servicios del mes, estado de turno; banner de alertas (vencidos/por vencer/faltantes); grid de documentación con badge por estado (verde/ámbar/gris).
- Vuelta a la lista sin perder contexto (estado local, sin rutas nuevas).
- `data-testid`: `dueno-expediente`, `expediente-volver/nombre/alertas/documentos`, `doc-estado-{tipo}`, `conductor-card-{id}`.

## 3. Cambios menores en server.py
- `POST /operadores` ahora registra `creado` (fecha de ingreso del expediente, §20).
  Los operadores existentes muestran "—" en ingreso (backfill innecesario: dato histórico no inventable).

## 4. Validación
- `tests/test_expedientes.py` (5 tests antes del backend): upsert por tipo sin duplicar,
  estados vencido/vigente, expediente completo, aislamiento 404, alertas con faltantes.
- Regresión: **58/58** (53 + 5) en 112 s (xdist).
- Captura E2E: expediente de Jorge Pérez — Licencia Vigente, INE Por vencer, Seguro Sin
  cargar + banner de alertas coherente.

## 5. Notas
- "Otros documentos configurables" (§20): el modelo acepta cualquier `tipo`; la lista
  normativa de UI es licencia/INE/seguro. Extensible sin migración.
