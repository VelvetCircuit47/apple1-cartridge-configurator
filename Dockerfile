# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build Apple1JS emulator ──────────────────────────────────────────
FROM node:20-alpine AS emulator-builder
WORKDIR /build/emulator
COPY emulator/package*.json ./
RUN npm ci
COPY emulator/ ./
# Zbuduj z obsługą karty A1C pod ścieżką /emulator/
COPY emulator/vite.cartridge.config.ts ./
RUN npm run build:cartridge
# Ustaw index-cartridge.html jako główny index dla /emulator/
RUN cp dist-cartridge/index-cartridge.html dist-cartridge/index.html

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Backend dependencies (bez devDependencies)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend source + bundled xa assembler
COPY backend/ ./backend/

# Frontend build
COPY --from=frontend-builder /build/frontend/dist ./public

# Emulator build pod /emulator/
COPY --from=emulator-builder /build/emulator/dist-cartridge ./public/emulator

# Apple-1 Cartridge repo (źródła ROM + binaria inc/)
COPY apple1-cartridge-repo/ ./apple1-cartridge-repo/

EXPOSE 3001
ENV PORT=3001

CMD ["node", "backend/index.js"]
