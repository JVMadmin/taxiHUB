# TaxiHUB — Arquitectura y Guía de Despliegue en VPS Oracle ARM64

Esta guía documenta la infraestructura en producción de **TaxiHUB** desplegada en el VPS Oracle Cloud (`159.54.146.150`).

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

## 3. Comandos de Gestión

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

### Re-ejecutar seeds reproducibles
```bash
sudo docker compose run --rm taxihub-seed
```

### Recargar Caddy tras cambios de configuración
```bash
sudo docker exec nexium-caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 4. Cuentas de Acceso Configuradas

- **Terminal Despacho**: `central` / `central123`
- **Portal Socios / Dueños**: `socio_roberto` / `socio123`
- **App Operador (Chofer)**: `op1` / `taxi123`

---

## 5. Regla de Red en Oracle Cloud (VCN Ingress)

Para permitir el tráfico HTTPS desde internet hacia Caddy, la lista de seguridad de la VCN debe tener permitidos los puertos 80 y 443:
- **Protocolo**: TCP
- **CIDR Origen**: `0.0.0.0/0`
- **Puertos Destino**: `80, 443`
