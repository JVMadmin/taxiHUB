#!/usr/bin/env bash
# Despliegue reproducible de TaxiHUB al VPS (reemplaza el `docker cp` manual).
#
#   scripts/deploy_vps.sh --revisar            # solo lectura: estado del VPS, no cambia nada
#   scripts/deploy_vps.sh --preparar <commit>  # pruebas del commit -> volumen downloads -> código -> build
#                                              # (no toca los contenedores en ejecución)
#   scripts/deploy_vps.sh --recrear <commit>   # recrea backend y luego frontend con lo construido
#   scripts/deploy_vps.sh <commit>             # --preparar y --recrear seguidos (<commit> por defecto: HEAD)
#
# Variables (fuera del repo, que es público; valores en el CLAUDE_HANDOFF.md local):
#   TAXIHUB_VPS       usuario@host
#   TAXIHUB_SSH_KEY   ruta a la llave privada
#   TAXIHUB_VPS_DIR   carpeta del proyecto en el VPS (por defecto /opt/nexium/projects/taxihub)
#   TAXIHUB_PYTHON    intérprete con backend/requirements.txt para correr las pruebas
#
# Garantías:
#   - Solo se despliega un commit concreto (git archive), probado en un worktree temporal:
#     ni archivos sin commit ni lo que otras sesiones agreguen después a la rama.
#   - El .env del VPS no se toca.
#   - downloads/ (APKs e instalador) se copia al volumen `taxihub_downloads` ANTES de recrear
#     el frontend y se verifica que el número de archivos no baje.
#   - Solo se reconstruyen/recrean taxihub-backend y taxihub-frontend (Mongo y los demás
#     proyectos del VPS no se reinician).
#   - Las imágenes anteriores quedan etiquetadas :anterior para volver atrás.
set -euo pipefail

: "${TAXIHUB_VPS:?Define TAXIHUB_VPS=usuario@host}"
: "${TAXIHUB_SSH_KEY:?Define TAXIHUB_SSH_KEY=ruta/a/la/llave}"
DIR="${TAXIHUB_VPS_DIR:-/opt/nexium/projects/taxihub}"
SSH=(ssh -i "$TAXIHUB_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$TAXIHUB_VPS")
COMPOSE="sudo -n docker compose -p taxihub -f docker-compose.prod.yml"
RAIZ="$(git rev-parse --show-toplevel)"
cd "$RAIZ"

revisar() {
  "${SSH[@]}" "DIR='$DIR' bash -s" <<'REMOTO'
set -u
echo "== Carpeta del proyecto: $DIR"
ls -la "$DIR" 2>&1 | grep -v ' \.env' || true
echo "== Contenedores taxihub"
sudo -n docker ps -a --filter name=taxihub --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
echo "== Montajes de taxihub-frontend"
sudo -n docker inspect taxihub-frontend --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
echo "== downloads/ dentro de taxihub-frontend"
sudo -n docker exec taxihub-frontend sh -c 'ls -la /usr/share/nginx/html/downloads 2>/dev/null; du -sh /usr/share/nginx/html/downloads 2>/dev/null' || true
echo "== Volumen taxihub_downloads"
sudo -n docker volume inspect taxihub_downloads --format '{{.Name}} {{.Mountpoint}}' 2>/dev/null || echo "(todavía no existe)"
echo "== Proyecto compose de los contenedores"
sudo -n docker inspect taxihub-backend --format '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.project.working_dir"}}'
REMOTO
}

MODO="todo"
case "${1:-}" in
  --revisar) revisar; exit 0 ;;
  --preparar) MODO="preparar"; shift ;;
  --recrear) MODO="recrear"; shift ;;
esac
REV="$(git rev-parse --short "${1:-HEAD}^{commit}")"
echo "== Commit a desplegar: $REV ($(git log -1 --format=%s "$REV"))"

preparar() {
  echo "== Pruebas del backend en un worktree temporal de $REV"
  local WT
  WT="$(mktemp -d)/taxihub-$REV"
  git worktree add --detach --quiet "$WT" "$REV"
  local PY="${TAXIHUB_PYTHON:-python}"
  if ! ( cd "$WT/backend" && "$PY" -m pytest -q -p no:cacheprovider -o required_plugins= ); then
    git worktree remove --force "$WT"
    echo "Las pruebas fallaron en $REV: no se despliega." >&2
    exit 1
  fi
  git worktree remove --force "$WT"

  local PAQ
  PAQ="$(mktemp -d)/taxihub-$REV.tar.gz"
  git archive --format=tar.gz -o "$PAQ" "$REV" backend frontend docker-compose.prod.yml
  echo "== Paquete $(du -h "$PAQ" | cut -f1) de $REV"
  scp -i "$TAXIHUB_SSH_KEY" -o StrictHostKeyChecking=accept-new "$PAQ" "$TAXIHUB_VPS:/tmp/taxihub-$REV.tar.gz"

  "${SSH[@]}" "DIR='$DIR' REV='$REV' COMPOSE='$COMPOSE' bash -s" <<'REMOTO'
set -euo pipefail
cd "$DIR"
test -f .env || { echo "Falta $DIR/.env"; exit 1; }

# 1) downloads/ -> volumen persistente (solo la primera vez; nunca borra nada)
if ! sudo -n docker volume inspect taxihub_downloads >/dev/null 2>&1; then
  sudo -n docker volume create taxihub_downloads >/dev/null
  TMP="$(mktemp -d)"
  if sudo -n docker exec taxihub-frontend test -d /usr/share/nginx/html/downloads; then
    sudo -n docker cp taxihub-frontend:/usr/share/nginx/html/downloads/. "$TMP/"
  fi
  sudo -n docker run --rm -v taxihub_downloads:/dst -v "$TMP":/src:ro alpine sh -c 'cp -a /src/. /dst/'
fi
echo "downloads/ en el volumen: $(sudo -n docker run --rm -v taxihub_downloads:/d alpine sh -c 'ls /d | wc -l') archivos"

# 2) Código del commit (no toca .env ni datos)
tar -xzf "/tmp/taxihub-$REV.tar.gz" -C "$DIR"
echo "$REV" > "$DIR/REVISION"
rm -f "/tmp/taxihub-$REV.tar.gz"

# 3) Imágenes actuales -> :anterior (vuelta atrás), solo si aún no se construyó este commit
if [ "$(cat "$DIR/.ultimo_build" 2>/dev/null)" != "$REV" ]; then
  for img in taxihub-taxihub-backend taxihub-taxihub-frontend; do
    if sudo -n docker image inspect "$img:latest" >/dev/null 2>&1; then
      sudo -n docker tag "$img:latest" "$img:anterior"
    fi
  done
fi

# 4) Build (los contenedores en ejecución no cambian todavía)
$COMPOSE build taxihub-backend taxihub-frontend
echo "$REV" > "$DIR/.ultimo_build"
echo "Preparado $REV: imágenes construidas, contenedores sin tocar."
REMOTO
}

recrear() {
  "${SSH[@]}" "DIR='$DIR' REV='$REV' COMPOSE='$COMPOSE' bash -s" <<'REMOTO'
set -euo pipefail
cd "$DIR"
[ "$(cat .ultimo_build 2>/dev/null)" = "$REV" ] || { echo "Primero: --preparar $REV"; exit 1; }
ANTES="$(sudo -n docker run --rm -v taxihub_downloads:/d alpine sh -c 'ls /d | wc -l')"

$COMPOSE up -d --no-deps taxihub-backend
for i in $(seq 1 40); do
  [ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' taxihub-backend)" = healthy ] && break
  sleep 3
done
if ! sudo -n docker inspect -f '{{.State.Health.Status}}' taxihub-backend | grep -q healthy; then
  echo "Backend no quedó sano; últimos logs:"; sudo -n docker logs --tail 40 taxihub-backend
  exit 1
fi
$COMPOSE up -d --no-deps taxihub-frontend

DESPUES="$(sudo -n docker exec taxihub-frontend sh -c 'ls /usr/share/nginx/html/downloads | wc -l')"
[ "$DESPUES" -ge "$ANTES" ] || { echo "ALERTA: downloads/ tenía $ANTES archivos y ahora $DESPUES"; exit 1; }
echo "Desplegado $REV · downloads/: $DESPUES archivos"
REMOTO

  echo "== Verificación pública"
  curl -fsS -o /dev/null -w "frontend %{http_code}\n" https://taxihub.cloud/
  curl -fsS -o /dev/null -w "api %{http_code}\n" https://taxihub.cloud/api/config/sitio
}

case "$MODO" in
  preparar) preparar ;;
  recrear) recrear ;;
  todo) preparar; recrear ;;
esac
