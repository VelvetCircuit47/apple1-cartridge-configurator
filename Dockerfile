# ── Stage 0: build xa assembler ───────────────────────────────────────────────
FROM debian:bookworm-slim AS xa-builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends xa65 && \
    rm -rf /var/lib/apt/lists/*

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
RUN npm install -g yarn
COPY emulator/package.json emulator/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY emulator/ ./
# Zbuduj z obsługą karty A1C pod ścieżką /emulator/
COPY emulator/vite.cartridge.config.ts ./
RUN yarn build:cartridge
# Ustaw index-cartridge.html jako główny index dla /emulator/
RUN cp dist-cartridge/index-cartridge.html dist-cartridge/index.html

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Backend dependencies (bez devDependencies)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend source
COPY backend/ ./backend/

# xa assembler z osobnego stage'a (bez bundlowania binarki w repo)
COPY --from=xa-builder /usr/bin/xa ./backend/xa

# Frontend build
COPY --from=frontend-builder /build/frontend/dist ./public

# Emulator build pod /emulator/
COPY --from=emulator-builder /build/emulator/dist-cartridge ./public/emulator

# Apple-1 Cartridge repo (źródła ROM + binaria inc/)
COPY apple1-cartridge-repo/ ./apple1-cartridge-repo/

# Build cartridge.bin from source using xa assembler
RUN cd ./apple1-cartridge-repo && \
    ../backend/xa -M -W -C -O ASCII -c src/cartridge.a65 -l cartridge.label -o cartridge.bin

EXPOSE 3001
ENV PORT=3001

CMD ["node", "backend/index.js"]
