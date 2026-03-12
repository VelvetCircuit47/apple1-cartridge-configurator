#!/bin/bash
# Przygotowuje kontekst Docker i buduje obraz
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Kopiuję emulator Apple1JS..."
rm -rf "$SCRIPT_DIR/emulator"
cp -r /home/user/Apple1JS "$SCRIPT_DIR/emulator"
rm -rf "$SCRIPT_DIR/emulator/.git" "$SCRIPT_DIR/emulator/node_modules" "$SCRIPT_DIR/emulator/dist"

echo "==> Kopiuję repozytorium apple1cartridge..."
rm -rf "$SCRIPT_DIR/apple1-cartridge-repo"
cp -r /home/user/apple1-cartridge-repo "$SCRIPT_DIR/apple1-cartridge-repo"

echo "==> Buduję obraz Docker..."
docker build -t apple1-configurator "$SCRIPT_DIR"

echo ""
echo "Gotowe! Uruchom:"
echo "  docker run -p 3001:3001 apple1-configurator"
echo "  lub: docker compose up"
