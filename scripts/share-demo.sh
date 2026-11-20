#!/usr/bin/env bash
# Публичная демо-ссылка на локальный сайт без VPS.
#
# Запускает SSH-туннель pinggy (бесплатно, без регистрации) и печатает ссылку.
# Ссылка живёт, пока открыт терминал и не спит Mac; бесплатный туннель — 60 минут.
#
# Usage: npm run demo:share [-- --port 3000]
set -euo pipefail

PORT=3000
if [[ "${1:-}" == "--port" && -n "${2:-}" ]]; then PORT="$2"; fi

if ! curl -sf -o /dev/null "http://localhost:${PORT}/api/health"; then
  echo "Локальный сайт на порту ${PORT} не запущен. Сначала: npm run build && npm run start"
  exit 1
fi

echo "Открываю публичную ссылку на http://localhost:${PORT} …"
echo "Ссылка появится ниже; пока она живёт, сайт доступен всем, кому вы её отправите."
echo "Остановить: Ctrl+C. Бесплатный туннель работает 60 минут."
echo

exec ssh -p 443 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
  -R0:"localhost:${PORT}" a.pinggy.io
