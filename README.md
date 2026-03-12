# Apple-1 Cartridge Configurator

A web app for building custom ROM cartridge images for the Apple-1 computer. Select programs, arrange them, build a binary, and download it — ready to flash to your cartridge. Includes a built-in Apple-1 emulator to test your ROM before flashing.

## Requirements

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

## Running

```bash
git clone https://github.com/VelvetCircuit47/apple1-cartridge-configurator
cd apple1-cartridge-configurator
docker-compose up
```

Then open **http://localhost:3001** in your browser.

## What it does

1. **Select programs** from the list of available ROMs
2. **Arrange the order** they'll appear in the cartridge
3. **Build** the cartridge binary
4. **Download** the `.bin` file and flash it to your cartridge
5. **Test** your ROM in the built-in Apple-1 emulator at `/emulator/`

## Project structure

```
backend/          Node.js/Express API (build, download endpoints)
frontend/         React UI
emulator/         Apple1JS emulator (served at /emulator/)
apple1-cartridge-repo/   ROM sources and cartridge hardware files
```
