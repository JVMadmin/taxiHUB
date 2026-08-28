# FASE 12 — DASHBOARD EJECUTIVO

> Estado: implementada y validada — 78/78 tests (5 nuevos), build OK, captura con KPIs y 4 gráficas.
> Cumple §25: servicios por hora/día/conductor, km, combustible, salud de flota.

## 1. Backend — `GET /api/dueno/ejecutivo` (socios_extra_module.py)

### Series (1 consulta por colección, sin N+1)
| Serie | Fuente | Notas |
|---|---|---|
| `servicios_por_hora` | servicios del mes con timestamp de HOY | 24 buckets 0–23 |
| `servicios_por_dia` | ventana configurable (default 14 días, máx 60) | días sin datos = 0 |
| `servicios_por_conductor` | mes actual, completados + ingresos | top 12 ordenado |
| `km_por_conductor` | turnos cerrados (odometro_fin − inicio) | top 12 |
| `combustible_por_mes` | cargas de la flota | últimos 12 meses, total + litros |
| `salud_flota` | documentos vencidos de la flota | conteo |

### Resumen ejecutivo
`hoy`, `completados_mes`, `cancelados_mes`, `ingresos_mes`, `km_totales`,
`flota_activa`, `conductores_activos`.

Aislamiento: todo deriva de `_vehiculos_de_dueno` → operador_ids/vehiculo_ids
propios (test explícito con dos socios).

## 2. Frontend — `pages/dueno/Ejecutivo.jsx`
- 8 KPICards (hoy, completados, cancelados, ingresos, km, flota, conductores, docs vencidos con tone alerta).
- 4 gráficas recharts con tema claro/oscuro (useChartTheme de Reportes):
  - Barras: Servicios por hora (hoy) — solo horas con datos.
  - Área con gradiente: Servicios por día (14 días).
  - Barras horizontales: Servicios por conductor (mes).
  - Barras azules: Combustible por mes ($).
- Estados vacíos profesionales ("Sin datos en este período").
- Nueva sección **Ejecutivo** en el panel (segunda posición, ícono BarChart3).
- data-testids: `dueno-ejecutivo`, `ejecutivo-error`, `ejecutivo-loading`.

## 3. Validación
- `tests/test_ejecutivo.py` (5 tests TDD): estructura completa, por-conductor con
  montos, series por hora/hoy + resumen, combustible por mes, aislamiento entre socios.
- Bug detectado en el camino: KeyError por dict sin `.get` en horas — corregido.
- Regresión: **78/78** en 173 s (xdist -n 2).
- Captura E2E: dashboard con KPIs (flota 1, conductores 1) y 4 charts con estados
  vacíos (flota demo sin servicios — correcto).
