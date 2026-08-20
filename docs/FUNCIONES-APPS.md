# taxiHUB — Plataforma de Despacho de Taxis

## Funciones importantes de las aplicaciones

**Versión 1.0 — Documento de presentación para clientes**

---

## 1. Resumen de la plataforma

taxiHUB es una plataforma completa de despacho y administración de flotillas de
taxis que funciona 100 % en la nube. Está formada por **tres aplicaciones**
integradas en tiempo real:

| Aplicación | Quién la usa | Dónde corre |
|---|---|---|
| **Terminal (Central de despacho)** | El dueño / la operadora | Web escritorio y **también en celular** |
| **App del Operador (taxista)** | Los choferes | Celular (web app) |
| **App del Pasajero** | Los usuarios que piden un taxi | Celular (web app) |

Toda la información (taxis, servicios, chat, reportes, calificaciones) se
comparte **en tiempo real** entre las tres aplicaciones gracias a conexiones
WebSocket.

---

## 2. Terminal — Central de despacho (dueño / operadora)

Pensada para el control total de la operación. Funciona tanto en **escritorio**
como en **celular** (diseño responsivo).

### 2.1 Mapa en tiempo real
- Mapa interactivo con todos los taxis de la flota ubicados en vivo.
- Marcadores 3D personalizados según el estado del taxi:
  - 🟢 Verde = Libre
  - 🔴 Rojo = Ocupado (en viaje)
  - 🟡 Amarillo = No disponible
- Animación de pulso al seleccionar un taxi para localizarlo fácilmente.
- Velocidad, rumbo y precisión GPS de cada unidad.
- Alarma automática de taxis con GPS desactualizado (stale).

### 2.2 Despacho y gestión de servicios
- **Nueva llamada**: registrar un servicio por teléfono o en pantalla, con
  origen/destino (por texto o **haciendo clic en el mapa**).
- **Despacho inteligente**: el sistema propone el taxi libre más cercano
  (cálculo por distancia) o el operador asigna manualmente.
- Ciclo completo del servicio: `pendiente → ofrecido → asignado → en curso →
  completado` (con cancelado, rechazado y vencido).
- Panel de servicios con pestañas y contadores en vivo.
- Ruta al destino del servicio activo con **distancia y ETA** sobre el mapa.

### 2.3 Flota y operadores
- Alta/edición de operadores (choferes) con foto de perfil.
- **Vehículos / Flota**: CRUD completo (número económico, placas, marca,
  modelo, color, estado).
- Historial de cada cliente con sus viajes.
- Filtros por ruta y por estado (disponibles / ocupados / offline / averiados).
- Búsqueda instantánea por nombre o número de unidad.

### 2.4 Chat de la central
- Conversaciones directas con cada taxista.
- Respuesta a reportes y consultas sin salir del mapa.
- Notificación en vivo de mensajes entrantes.

### 2.5 Reportes de objetos perdidos
- Los taxistas reportan objetos olvidados con **foto + descripción**.
- La central ve las fotos y resuelve el reporte.

### 2.6 Configuración comercial
- **Tarifas predefinidas**: crear/editar precios que el taxista aplica con un
  toque.
- **Rutas** con colores para organizar la operación.
- Tiempos de operación y conexión por operador.
- Respaldo y auditoría desde el panel de desarrollador.

---

## 3. App del Operador (taxista)

Diseño tipo app móvil, centrado y optimizado para el celular del chofer.

### 3.1 Turno y estado
- Inicio de sesión seguro por usuario y contraseña.
- Botones de estado: **Libre / Ocupado / No disponible / Averiado**.
- Cronómetro de tiempo en operación (persistente entre sesiones).
- Mantiene la pantalla encendida durante el turno (Wake Lock).

### 3.2 Recibir y realizar servicios
- Recibe ofertas de viaje con **cuenta regresiva** y botones grandes
  **Aceptar / Rechazar**.
- Al aceptar: marcador del cliente y **ruta real sobre las calles (OSRM)** con
  distancia y ETA en vivo, recalculada al moverse.
- Botones "Llegué al cliente" y "Finalizar viaje".
- También puede **iniciar su propio servicio** (origen/destino/costo) con
  tarifas de un toque o precio libre.

### 3.3 Navegación y GPS
- Posición del vehículo con icono orientado por rumbo.
- Mapa a pantalla completa con botón para re-centrar.
- Indicador de precisión GPS y de conexión (online / reconectando / offline).

### 3.4 Comunicación
- **Chat con el pasajero del viaje actual** (si el pasajero usa la app).
- Chat con la central.
- Reporte de objetos perdidos con foto desde la cámara o galería.

### 3.5 Calificación
- Recibe la calificación de 1 a 5 estrellas de sus pasajeros (visible en su
  ficha de conductor).

---

## 4. App del Pasajero

La cara de la plataforma hacia el usuario final.

### 4.1 Pedir un taxi en segundos
- Registro e inicio de sesión sencillo.
- "¿A dónde vamos?" → escribir el destino o **tocar el mapa** para fijarlo.
- **Usar mi ubicación actual** como origen con un toque.

### 4.2 Seguimiento del viaje en vivo
- Mapa con la posición del taxi asignado **en tiempo real** (vía WebSocket
  autenticado, sin exponer la flota completa).
- Tarjeta del conductor: **nombre, foto, unidad y calificación promedio**.
- Distancia y tiempo estimado de llegada.
- Cancelación del viaje si todavía no arrancó.

### 4.3 Menú personal
- **Historial** de todos sus viajes.
- **Perfil** con sus datos.
- **Cerrar sesión** seguro.

### 4.4 Chat con su conductor
- Conversación directa con el taxista del viaje durante el servicio.

### 4.5 Calificación del conductor
- Al terminar el viaje, califica con **1 a 5 estrellas + comentario**.
- La calificación queda guardada y promedia en la ficha pública del conductor.

---

## 5. Seguridad

- **Inicio de sesión seguro** con contraseñas cifradas (bcrypt) y tokens JWT.
- **Permisos por rol**: cada aplicación solo accede a lo que le corresponde:
  - El pasajero **nunca** ve la flota, solo su propio viaje.
  - El operador solo ve y opera su propia cuenta y sus servicios.
  - La central administra la operación completa.
- WebSockets protegidos con token de sesión.
- Cifrado de contraseñas y buenas prácticas de seguridad en toda la API.

---

## 6. Resumen de funciones por pantalla

### Terminal (dueño)
- Mapa en vivo con taxis por estado (verde/rojo/amarillo).
- Despacho automático y manual con candidatos por cercanía.
- Nueva llamada con origen/destino por mapa.
- Panel de servicios con contadores en vivo.
- Gestión de operadores, vehículos, clientes, rutas y tarifas.
- Chat central ↔ taxistas. Reportes de objetos con foto.
- Funciona en **escritorio y celular**.

### Operador (taxista)
- Login, turno con cronómetro, estados Libre/Ocupado/No disponible/Averiado.
- Ofertas de viaje con Aceptar/Rechazar y cuenta regresiva.
- Navegación GPS con ruta real, distancia y ETA.
- Tarifas de un toque y precio libre.
- Chat con pasajero y con la central. Reporte de objetos con foto.
- Calificación recibida de sus pasajeros.

### Pasajero
- Registro/login. Pedir taxi por dirección o tocando el mapa.
- Seguimiento en vivo del taxi asignado.
- Tarjeta del conductor (foto, unidad, calificación).
- Historial de viajes. Chat con su conductor.
- Calificación 1–5 estrellas con comentario.

---

## 7. Aspectos técnicos (resumen para el área de tecnología)

| Componente | Tecnología |
|---|---|
| Backend (API) | Python **FastAPI** |
| Base de datos | **MongoDB** (flexible para flotas grandes) |
| Frontend | **React** con diseño **responsivo** (web/escritorio/celular) |
| Mapas | **Leaflet** + tiles CARTO (ruteo por **OSRM**, con fallback automático) |
| Tiempo real | **WebSockets** (estado, GPS, servicios, chat) |
| Seguridad | JWT por rol + contraseñas cifradas (bcrypt) |
| Despliegue | 100 % web: funciona en cualquier navegador, sin instalar apps |

> Nota: al ser aplicaciones web, la misma plataforma puede instalarse en el
> escritorio del dueño (p. ej. como acceso directo) y abrirse en el celular de
> taxistas y pasajeros desde cualquier navegador.
