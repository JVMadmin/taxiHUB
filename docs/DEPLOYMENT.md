# TaxiHUB — Arquitectura y Guía de Despliegue en VPS Oracle ARM64

Esta guía documenta la infraestructura en producción de **TaxiHUB** desplegada en un VPS Oracle Cloud (IP y acceso en el `CLAUDE_HANDOFF.md` local, fuera de git).

---

## 1. Infraestructura y Redes Docker

El despliegue reutiliza la arquitectura modular de `/opt/nexium`:
- **Red `proxy` (bridge)**: Tráfico público hacia Caddy (`nexium-caddy`) y frontend (`taxihub-frontend`).
- **Red `backend` (bridge interna)**: Comunicación aislada entre `taxihub-backend`, `taxihub-mongo` y `nexium-postgres`.

### Contenedores en Ejecución
1. **`taxihub-mongo`**: MongoDB 7 oficial ARM64. Persistencia en volumen `taxihub_mongo_data`.
2. **`taxihub-backend`**: FastAPI + Python 3.11 ARM64 (`taxihub-taxihub-backend`). Conectado a redes `backend` y `proxy`. Healthcheck en `/api/config/sitio`.
3. **`taxihub-frontend`**: React 19 SPA compilado con Node 22 + Nginx Alpine ARM64 (`taxihub-taxihub-frontend`).
4. **`nexium-caddy`**: Caddy 2 reverse proxy. Gestiona certificados TLS automáticos para `taxihub.cloud` y `www.taxihub.cloud`.
5. **`nexium-postgres`**: PostgreSQL 17 oficial. Base de datos `taxihub` creada con usuario `taxihub`.

---

## 2. Ubicación de Archivos en el VPS

- **Proyecto**: `/opt/nexium/projects/taxihub/`
  - `docker-compose.yml` (enlace simbólico o copia de `docker-compose.prod.yml`)
  - `.env` (variables de producción con permisos `600`)
- **Secretos**: `/opt/nexium/secrets/taxihub.env` (permisos `600`, fuera del control de versiones).
- **Caddyfile**: `/opt/nexium/infra/caddy/Caddyfile`
- **Backups**: `/opt/nexium/backups/postgres/`
  - Backup pre-despliegue: `backup_pre_taxihub_20261007_1936.sql`

---

## 3. Desplegar una nueva versión

Ya no se usa `docker cp` dentro de los contenedores (se perdía en cada rebuild y dejaba
producción distinta de git). Desde la raíz del repo, en Git Bash:

```bash
export TAXIHUB_VPS=usuario@host TAXIHUB_SSH_KEY=/ruta/llave.key TAXIHUB_PYTHON=/ruta/python
scripts/deploy_vps.sh --revisar              # solo lectura: estado del VPS, montajes y downloads/
scripts/deploy_vps.sh --preparar <commit>    # prueba el commit, migra downloads/, sube código y construye
scripts/deploy_vps.sh --recrear <commit>     # recrea backend y luego frontend (sin esto nada cambia en vivo)
```

- Solo se despliega lo que tiene commit; el `.env` del VPS no se toca.
- `downloads/` (APKs e instalador) vive en el volumen `taxihub_downloads`. La primera vez
  el script copia ahí lo que había dentro del contenedor y verifica que no falte ningún archivo.
- Mongo y los demás proyectos del VPS no se reinician.
- Vuelta atrás: las imágenes previas quedan como `taxihub-taxihub-backend:anterior` y
  `taxihub-taxihub-frontend:anterior`.

## 4. Comandos de Gestión

### Ver estado de contenedores
```bash
cd /opt/nexium/projects/taxihub
sudo docker compose ps
```

### Ver logs en tiempo real
```bash
sudo docker compose logs -f taxihub-backend
sudo docker compose logs -f taxihub-frontend
sudo docker logs -f nexium-caddy
```

### Datos de simulación
El backend siembra la flota demo al arrancar si hay menos de 15 operadores
(`SIMULACION_DEMO=1`, valor por defecto). Para volver a sembrar con la sesión de
terminal o dev: `POST /api/simulacion/sembrar`. Para apagar la simulación:
`SIMULACION_DEMO=0` en el `.env` y redesplegar.

### Recargar Caddy tras cambios de configuración
```bash
sudo docker exec nexium-caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 5. Cuentas de Acceso Configuradas

- **Terminal Despacho**: `central` / `central123`
- **Portal Socios / Dueños**: `socio_roberto` / `socio123`
- **App Operador (Chofer)**: `op1` / `taxi123`

---

## 6. Regla de Red en Oracle Cloud (VCN Ingress)

Para permitir el tráfico HTTPS desde internet hacia Caddy, la lista de seguridad de la VCN debe tener permitidos los puertos 80 y 443:
- **Protocolo**: TCP
- **CIDR Origen**: `0.0.0.0/0`
- **Puertos Destino**: `80, 443`
