# FASE 10 — COMBUSTIBLE Y TURNOS (config socio)

> Estado: implementada y validada — 68/68 tests (5 nuevos de turnos config), build OK, captura del editor operando.
> Hallazgo de auditoría cerrado: "Turnos sin formulario de configuración" — resuelto.

## 1. Backend — validado por tests (ya existía, sin cobertura)
`tests/test_turnos_config.py` (5 tests):
- Modo normal: 1 conductor, renta 0.
- Modo normal con 2 conductores → 400.
- Modo turnos día/noche con renta semanal → suma al total (`renta_semana_total`).
- Modo turnos con 3 → 400.
- Ownership: vehículo de otro socio → 404.

Combustible ya tenía escritura y tests indirectos (UI F7 con POST carga + evidencia);
sin cambios en esta fase (no-regresión verificada por la suite completa).

## 2. Frontend — Turnos.jsx
- Botón **"Configurar turnos"** por vehículo → modal `EditorTurnos`:
  - Modo normal: selector de conductor único.
  - Modo turnos: dos bloques (día/noche) con conductor, renta semanal y horarios
    inicio/fin.
- Los nombres de conductores se resuelven desde `GET /dueno/conductores`
  (los turnos guardan `operador_id`; la vista mapea id→nombre localmente).
- Guardar → POST `/dueno/turnos/config` → recarga resumen con renta total.
- data-testids: `turnos-modal`, `turnos-editar-{unidad}`, `turnos-cond-{dia|noche|normal}`,
  `turnos-renta-{dia|noche}`, `turnos-cancelar`, `turnos-guardar`.

## 3. Validación
- 5 tests nuevos (verificación del contrato que consume la UI).
- Regresión completa: **68/68** en 146 s (xdist -n 2).
- Captura E2E: modal "Conductor único — SD-001" con selector, sobre la tarjeta
  SD-001 con "Configurar turnos".
