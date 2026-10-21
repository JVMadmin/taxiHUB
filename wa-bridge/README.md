# Puente WhatsApp de TaxiHUB (Baileys)

Servicio Node que conecta el WhatsApp de cada central (sitio) como **dispositivo vinculado**
(igual que WhatsApp Web) y lo comunica con el backend.

- Una sesión por sitio. Credenciales en `DATA_DIR/<sitio>/auth`, contactos que escribieron en
  `DATA_DIR/<sitio>/contactos.json` (volumen `taxihub_wa_sesiones` en producción).
- **Entrantes** → `POST {BACKEND_URL}/api/wa/webhook` con `Authorization: Bearer <token>`:
  `{sitio_id, remitente: {nombre, telefono}, mensaje: {texto, lat?, lng?}}`. Ignora grupos,
  estados, canales y mensajes propios. Resuelve el número real cuando WhatsApp manda el chat por LID.
- **Salientes** (`POST /send`): solo a quien escribió en las últimas 24 h, cola por sitio con pausa
  mínima de 3 s, "escribiendo…" antes de enviar. Responde `202` al encolar y avisa el resultado al
  backend con `{tipo: "estado_envio", mensaje_id, estado: enviado|fallido}`.

## API interna (solo red Docker, siempre con `Authorization: Bearer <token>`)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/health` | Salud (sin token) |
| GET | `/status?sitio_id=` | `{sesion, estado, conectado, numero_vinculado, qr_code, pairing_code, motivo}` |
| POST | `/sesiones/<sitio>/iniciar` | `{modo: "qr"}` o `{modo: "codigo", telefono}` → QR o código de 8 caracteres |
| POST | `/sesiones/<sitio>/cerrar` | Cierra la sesión en WhatsApp y borra credenciales |
| POST | `/send` | `{sitio_id, telefono, texto, typing_ms?, delay_queue_ms?, mensaje_id?}` |

`estado`: `desconectado`, `conectando`, `esperando_qr`, `esperando_codigo`, `conectado`, `reconectando`.

## Variables

| Variable | Por defecto | |
|---|---|---|
| `WA_BRIDGE_TOKEN` o `WA_WEBHOOK_TOKEN` | — (obligatoria) | El mismo valor que el backend |
| `BACKEND_URL` | `http://taxihub-backend:8000` | |
| `DATA_DIR` | `/data` | |
| `PORT` | `3099` | |
| `WA_NOMBRE_DISPOSITIVO` | `TaxiHUB Central` | Nombre en "Dispositivos vinculados" |

## Local

```bash
cd wa-bridge
npm install
WA_WEBHOOK_TOKEN=un-token-largo BACKEND_URL=http://127.0.0.1:8001 DATA_DIR=./data node src/index.js
npm test
```

Backend: `WA_BRIDGE_URL=http://127.0.0.1:3099` y el mismo `WA_WEBHOOK_TOKEN`. Los sitios demo
(`default`, `sitio_pakalna`) siguen simulados; para probar el puente en ellos: `WA_PUENTE_EN_DEMO=1`.

## Riesgo

Baileys **no es oficial**. Las reglas de arriba reducen el riesgo, pero WhatsApp puede bloquear un
número si los pasajeros lo reportan. Usa un número dedicado a la central, no uno personal.
