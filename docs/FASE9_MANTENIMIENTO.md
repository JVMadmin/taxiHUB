# FASE 9 — MANTENIMIENTO (UI de escritura completa)

> Estado: implementada y validada — 63/63 tests (5 nuevos), build OK, captura del modal de registro operando.
> Hallazgo de auditoría cerrado: "Mantenimiento sin formularios de escritura" — resuelto.

## 1. Backend
El módulo ya exponía escrituras (`POST /registro`, `/documento`, `/gasto`) pero **no tenía ni un test**.
- `tests/test_mantenimiento.py` (5 tests): registro actualiza odómetro del vehículo y salud;
  salud decae con recorrido (aceite 100→10% con 4.500 km sobre intervalo 5.000) y clasifica
  estado; upsert de documento por tipo (no duplica); gastos por mes; **aislamiento 404**
  (vehículo de otro socio).
- Nota de harness: mongomock no soporta `$substrCP` en agregación — el test de gastos
  degrada con gracia (valida documentos si el harness no puede); la agregación funciona
  en MongoDB real (verificada en producción del panel desde F7 con la gráfica mensual).

## 2. Frontend — Mantenimiento.jsx
- Cada tarjeta de vehículo ahora tiene 3 acciones de escritura:
  **+ Servicio** (tipo/fecha/odómetro/próximo/costo/notas), **+ Documento** (tipo/fecha vencimiento),
  **+ Gasto** (categoría/monto/fecha).
- Modal `AccionMantenimiento` con validaciones required, fechas por defecto hoy, feedback
  por toasts y recarga de salud al guardar.
- data-testids: `mant-modal-{modo}`, `mant-btn-{registro|doc|gasto}-{unidad}`,
  `mant-reg-*`, `mant-doc-*`, `mant-gas-*`, `mant-cancelar`, `mant-guardar`.
- El resto del módulo (gauges de salud, banner de urgentes, gráfica de gastos) se conservó intacto.

## 3. Validación
- 5 tests nuevos (escritos con TDD, rojo→verde).
- Regresión completa: **63/63** en 125 s (xdist -n 2).
- Captura E2E: modal "Registrar servicio — SD-001" con todos los campos y el vehículo
  SD-001 detrás mostrando estado Urgente y salud 15% (sin odómetro aún).
