#!/usr/bin/env bash
# Instalacion inicial en el VPS (Ubuntu 24.04, Traefik ya en 80/443). Se ejecuta como root
# UNA vez, desde /opt/stat-sem tras la primera subida:  bash deploy/instalar_vps.sh
# Es idempotente: se puede repetir sin romper nada.
set -euo pipefail

RAIZ=/opt/stat-sem
USUARIO=statsem
TRAEFIK_DIR=/docker/traefik/dynamic

echo "== paquetes"
apt-get install -y -q python3-venv python3-dev build-essential >/dev/null

echo "== usuario de servicio sin shell"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$RAIZ" --shell /usr/sbin/nologin "$USUARIO"

echo "== entorno virtual y dependencias"
[ -x "$RAIZ/venv/bin/python" ] || python3 -m venv "$RAIZ/venv"
"$RAIZ/venv/bin/pip" install -q --upgrade pip
"$RAIZ/venv/bin/pip" install -q -r "$RAIZ/backend/requirements.txt"

echo "== permisos: el servicio solo escribe en backend/data"
mkdir -p "$RAIZ/backend/data/sesiones"
chown -R root:root "$RAIZ"
chown -R "$USUARIO:$USUARIO" "$RAIZ/backend/data"
chmod -R o-w "$RAIZ"

echo "== servicio systemd"
install -m 644 "$RAIZ/deploy/stat-sem.service" /etc/systemd/system/stat-sem.service
systemctl daemon-reload
systemctl enable --now stat-sem
systemctl restart stat-sem

echo "== enrutado en Traefik"
if [ -d "$TRAEFIK_DIR" ]; then
  install -m 644 "$RAIZ/deploy/traefik-stat-sem.yml" "$TRAEFIK_DIR/stat-sem.yml"
else
  echo "AVISO: no existe $TRAEFIK_DIR; el servicio escucha en 127.0.0.1:8789 y hay que enrutarlo a mano"
fi

sleep 2
systemctl --no-pager --lines=5 status stat-sem || true
curl -fsS -H 'X-Cliente: instalador' http://127.0.0.1:8789/api/salud && echo " <- responde"
