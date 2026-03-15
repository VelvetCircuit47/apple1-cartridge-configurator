/**
 * Web Worker dla wariantu Apple-1 z kartą A1C Cartridge.
 * Eksponuje API przez Comlink, analogicznie do głównego workera.
 */
import * as Comlink from 'comlink';
import { CartridgeWorkerState } from './CartridgeWorkerState';
import type { VideoData } from './types/video';

const state = new CartridgeWorkerState();

// Automatycznie wysyła "4000R" + Enter do monitora Woza po załadowaniu ROM
async function autoRun4000(): Promise<void> {
    // Poczekaj na inicjalizację monitora
    await new Promise(r => setTimeout(r, 800));
    for (const key of ['4', '0', '0', '0', 'R']) {
        state.keyboard.write(key);
        await new Promise(r => setTimeout(r, 50));
    }
    state.keyboard.write('Enter');
}

// Zbiór callbacków wideo
const videoCallbacks = new Set<(data: VideoData) => void>();

// Subskrybuj wideo
if (state.video && typeof state.video.subscribe === 'function') {
    state.video.subscribe((data: VideoData) => {
        videoCallbacks.forEach(cb => {
            try { cb(data); } catch { /* ignore */ }
        });
    });
}

const cartridgeAPI = {
    // --- Sterowanie emulacją ---
    pauseEmulation() {
        state.apple1.clock.pause();
        state.isPaused = true;
    },
    resumeEmulation() {
        state.apple1.clock.resume();
        state.isPaused = false;
    },
    reset() {
        state.apple1.reset();
        autoRun4000();
    },

    // --- Ładowanie ROM ---
    async loadCartridgeROM(data: number[]) {
        state.apple1.loadCartridgeROM(new Uint8Array(data));
        state.isPaused = false;
        // Automatycznie wpisz "4000R" + Enter żeby uruchomić menu
        autoRun4000();
    },

    // --- Wejście klawiatury ---
    keyDown(key: string) {
        state.keyboard.write(key);
    },

    // --- Subskrypcja wideo ---
    onVideoUpdate(callback: (data: VideoData) => void) {
        videoCallbacks.add(callback);
        return Comlink.proxy(() => {
            videoCallbacks.delete(callback);
        });
    },

    // --- Status ---
    getEmulationStatus(): 'running' | 'paused' {
        return state.isPaused ? 'paused' : 'running';
    },

    // --- Odczyt pamięci ---
    readMemoryRange(start: number, length: number): number[] {
        const out: number[] = [];
        for (let i = 0; i < length; i++) {
            const addr = start + i;
            if (addr >= 0 && addr <= 0xffff) out.push(state.apple1.bus.read(addr));
            else out.push(0);
        }
        return out;
    },

    // --- Konfiguracja wideo ---
    setCrtBsSupport(enabled: boolean) {
        state.video.setSupportBS(enabled);
    },
};

export type CartridgeAPI = typeof cartridgeAPI;

Comlink.expose(cartridgeAPI);

// Uruchom pętlę emulacji
state.apple1.startLoop();
