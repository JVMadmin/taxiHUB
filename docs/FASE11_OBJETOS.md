# FASE 11 — OBJETOS OLVIDADOS (ciclo de resguardo)

> Estado: implementada y validada — 73/73 tests (5 nuevos), build OK.
> Cierre del hallazgo de auditoría: "reportes_objetos binario sin vínculo servicio/unidad".

## 1. Backend

### Estados del ciclo (§23) — reemplaza el binario pendiente/resuelto
`encontrado → resguardo → devuelto | cerrado`

- `POST /reportes` (taxista): el estado inicial es **encontrado** con historial
  de auditoría. **Vínculo opcional**: si el conductor tiene servicio
  asignado/en_curso, el reporte hereda `servicio_id` y `unidad{id, numero_economico, placa}`.
- `PATCH /reportes/{id}/estado` (terminal): cambia de estado con **historial**
  (`{estado, ts, actor, nota?}`) — nota opcional para cierres especiales.
- `PATCH /reportes/{id}/resolver` (compat 1.x): ahora equivale a `cerrado`
  con entrada de historial — nada que consuma el endpoint viejo se rompe.
- Validación con `Literal` → estado inválido = 422.
- Solo terminal cambia estados (operador → 401/403, testeado).

## 2. Frontend — ReportesPanel (Terminal)
- Badge de estado con color SSOT: Encontrado (azul), En resguardo (ámbar),
  Devuelto (verde), Cerrado (gris).
- Acción contextual: Encontrado → **"A resguardo"**; Resguardo → **"Marcar devuelto"**;
  botón **"Cerrar"** disponible salvo en estados finales.
- Muestra unidad y servicio asociado cuando existen.
- Compat: el campo `estado: "pendiente"` de datos históricos se muestra como
  texto crudo (sin botón roto); los nuevos nacen en el ciclo.
- data-testids: `reporte-estado-{id}`, `avanzar-{id}`, `cerrar-{id}`.

## 3. Validación
- `tests/test_objetos.py` (5 tests antes del backend): ciclo completo con
  historial, estado inválido 422, cierre con nota, solo-terminal (403),
  vínculo heredado de servicio activo + unidad resuelta.
- Regresión: **73/73** en 157 s (xdist -n 2).

## 4. Nota de datos históricos
Reportes previos con `estado:"pendiente"/"resuelto"` siguen listándose; el
endpoint compat `/resolver` los migra a `cerrado` al usarse. No se requiere
migración masiva (los reportes viejos resueltos se muestran como "resuelto"
en texto hasta que alguien toque el registro).
