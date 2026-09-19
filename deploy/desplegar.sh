#!/usr/bin/env bash
# Despliegue manual desde el equipo (Git Bash en Windows o Linux):
#   bash deploy/desplegar.sh            -> pruebas + build + subida + reinicio + comprobacion
#   bash deploy/desplegar.sh --sin-pruebas
# Requiere el atajo SSH "tutor-vps" (o exportar VPS=usuario@ip) y que instalar_vps.sh ya corrio.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS="${VPS:-tutor-vps}"
RAIZ=/opt/stat-sem
URL="${SITIO_URL:-https://sem.jarestrepo.com}"

if [ "${1:-}" != "--sin-pruebas" ]; then
  echo "== pruebas del servidor"
  (cd backend && python -m pytest tests -q)
  echo "== pruebas y tipos del frontend"
  (cd frontend && npx vitest run --silent && npx tsc -b)
fi

echo "== build del frontend"
(cd frontend && npx vite build --logLevel warn)

echo "== empaquetar"
PAQUETE=$(mktemp -t stat-sem-XXXX.tar.gz)
tar -czf "$PAQUETE" \
  --exclude='backend/data/sesiones' --exclude='__pycache__' --exclude='.pytest_cache' \
  backend/app backend/scripts backend/tests backend/requirements.txt backend/data/ejemplos \
  frontend/dist deploy README.md

echo "== subir a $VPS"
ssh "$VPS" "mkdir -p $RAIZ"
scp -q "$PAQUETE" "$VPS:/tmp/stat-sem.tar.gz"
rm -f "$PAQUETE"

echo "== instalar y reiniciar"
ssh "$VPS" bash -s <<EOF
set -e
cd $RAIZ
tar -xzf /tmp/stat-sem.tar.gz && rm -f /tmp/stat-sem.tar.gz
if [ -x venv/bin/pip ]; then venv/bin/pip install -q -r backend/requirements.txt; fi
chown -R root:root $RAIZ && chown -R statsem:statsem $RAIZ/backend/data 2>/dev/null || true
install -m 644 deploy/stat-sem.service /etc/systemd/system/stat-sem.service
[ -d /docker/traefik/dynamic ] && install -m 644 deploy/traefik-stat-sem.yml /docker/traefik/dynamic/stat-sem.yml
systemctl daemon-reload
systemctl restart stat-sem
# uvicorn tarda unos segundos en importar scipy y semopy: esperar a que escuche
for i in \$(seq 1 30); do
  curl -fsS -H "X-Cliente: despliegue" http://127.0.0.1:8789/api/salud >/dev/null 2>&1 && break
  sleep 2
done
systemctl is-active stat-sem
EOF

echo "== comprobar"
curl -fsS --retry 5 --retry-delay 3 --retry-all-errors -H 'X-Cliente: despliegue' "$URL/api/salud" && echo " <- $URL responde"
