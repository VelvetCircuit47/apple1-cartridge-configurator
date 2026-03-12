/**
 * CartridgeMemory — emulacja karty Apple-1 Cartridge
 *
 * Pokrywa przestrzeń adresową $4000–$BFFF (32KB):
 *   $4000–$47FF  Loader ROM (zawsze widoczny)
 *   $4800–$BFFF  Region bankowany:
 *                  - ROM banked IN  → dane z ROM (programy)
 *                  - ROM banked OUT → RAM karty
 *
 * Sterowanie bankowaniem (zapis do $47F8–$47FF):
 *   A0 = 1 (np. $47FF) → ROM banked IN
 *   A0 = 0 (np. $47FE) → ROM banked OUT
 */

import type { IoAddressable } from '../core/types';

// Bus passes RELATIVE addresses (address - base), so all constants are relative to $4000
const BANK_CTRL_START = 0x07f8; // $47F8 - $4000
const BANK_CTRL_END   = 0x07ff; // $47FF - $4000
const BANKED_START    = 0x0800; // $4800 - $4000
const SIZE            = 0x8000; // 32KB ($4000–$BFFF)

export class CartridgeMemory implements IoAddressable {
    private rom: Uint8Array;
    private ram: Uint8Array;
    private romBankedIn: boolean = true; // ROM banked in by default

    constructor() {
        this.rom = new Uint8Array(SIZE).fill(0xff);
        this.ram = new Uint8Array(SIZE - BANKED_START).fill(0x00);
    }

    /** Załaduj binarny wsad ROM (32KB, od adresu fizycznego 0 = logicznego $4000) */
    loadROM(data: Uint8Array): void {
        const len = Math.min(data.length, SIZE);
        this.rom.fill(0xff);
        this.rom.set(data.subarray(0, len), 0);
        this.romBankedIn = true; // Reset: ROM domyślnie włączony
    }

    read(address: number): number {
        // address is relative: 0x0000 = $4000, 0x07FF = $47FF, 0x0800 = $4800, 0x7FFF = $BFFF

        // $4000–$47FF (rel 0x0000–0x07FF): zawsze ROM (loader)
        if (address < BANKED_START) {
            return this.rom[address] ?? 0xff;
        }

        // $4800–$BFFF (rel 0x0800–0x7FFF): zależy od stanu bankowania
        if (this.romBankedIn) {
            return this.rom[address] ?? 0xff;
        } else {
            return this.ram[address - BANKED_START] ?? 0x00;
        }
    }

    write(address: number, value: number): void {
        // address is relative: 0x0000 = $4000, 0x07FF = $47FF, 0x0800 = $4800

        // Sterowanie bankowaniem: $47F8–$47FF (rel 0x07F8–0x07FF)
        if (address >= BANK_CTRL_START && address <= BANK_CTRL_END) {
            this.romBankedIn = (address & 1) === 1;
            return;
        }

        // Zapis do RAM (gdy ROM wyłączony), region $4800–$BFFF (rel 0x0800–0x7FFF)
        if (address >= BANKED_START && !this.romBankedIn) {
            this.ram[address - BANKED_START] = value & 0xff;
        }
        // Zapis do $4000–$47FF ignorowany (ROM tylko do odczytu)
    }

    get isBankedIn(): boolean {
        return this.romBankedIn;
    }
}
