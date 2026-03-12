#!/bin/bash
# Start Apple-1 Cartridge Configurator
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Zbuduj frontend jeśli brak lub nieaktualny
if [ ! -f "$SCRIPT_DIR/public/index.html" ]; then
  echo "Buduję frontend..."
  cd "$SCRIPT_DIR/frontend" && npm run build && cp -r dist/* "$SCRIPT_DIR/public/"
fi

echo "Startuje serwer na http://localhost:3001 ..."
echo "  Konfigurator: http://localhost:3001/"
echo "  Emulator:     http://localhost:3001/emulator/"
echo ""
echo "Wciśnij Ctrl+C żeby zatrzymać."

cd "$SCRIPT_DIR/backend" && node index.js
