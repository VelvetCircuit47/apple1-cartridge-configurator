/**
 * Apple1Cartridge — wariant Apple-1 z obsługą karty A1C
 *
 * Mapa pamięci (tryb ROM):
 *   $0000–$0FFF  RAM 4KB (standardowy Apple-1)
 *   $1000–$3FFF  RAM 12KB (dodatkowy RAM karty A1C)
 *   $4000–$BFFF  CartridgeMemory (32KB, bankowany ROM/RAM)
 *   $D010–$D013  PIA 6820
 *   $E000–$EFFF  RAM 4KB (rozszerzony, dla Integer BASIC itp.)
 *   $FF00–$FFFF  Woz Monitor ROM
 */

import CPU6502 from '../core/cpu6502';
import PIA6820 from '../core/PIA6820';
import Clock from '../core/Clock';
import ROM from '../core/ROM';
import RAM from '../core/RAM';
import Bus from '../core/Bus';
import KeyboardLogic from './KeyboardLogic';
import DisplayLogic from './DisplayLogic';
import { CartridgeMemory } from './CartridgeMemory';
import { loggingService } from '../services/LoggingService';
import { InspectableIoComponent } from '../core/InspectableIoComponent';
import type { IoComponent, BusSpaceType } from '@/core/types';
import type { IInspectableComponent } from '../core/types';
import type { VideoState } from './TSTypes';

import wozMonitor from './progs/woz_monitor';
import { CPU_SPEED_MHZ, CPU_STEP_INTERVAL_MS } from './constants/system';

class Apple1Cartridge {
    id = 'apple1cartridge';
    type = 'Apple1Cartridge';

    pia: PIA6820;
    keyboardLogic: KeyboardLogic;
    displayLogic: DisplayLogic;
    video: IoComponent<VideoState>;
    keyboard: IoComponent;

    rom: ROM;                      // Woz Monitor $FF00–$FFFF
    ramBank1: RAM;                 // $0000–$0FFF
    ramBank1b: RAM;                // $1000–$3FFF
    ramBank2: RAM;                 // $E000–$EFFF
    cartridge: CartridgeMemory;    // $4000–$BFFF

    busMapping: Array<BusSpaceType>;
    bus: Bus;
    cpu: CPU6502;
    clock: Clock;

    get children(): IInspectableComponent[] {
        return [
            this.cpu,
            this.bus,
            this.rom,
            this.ramBank1,
            this.ramBank1b,
            this.ramBank2,
            this.pia,
            this.clock,
            new InspectableIoComponent('video', 'IoComponent', this.video),
            new InspectableIoComponent('keyboard', 'IoComponent', this.keyboard),
        ];
    }

    getCompositionTree(): IInspectableComponent {
        return this;
    }

    getInspectable() {
        return { id: this.id, type: this.type, name: 'Apple 1 + A1C Cartridge' };
    }

    constructor({ video, keyboard }: { video: IoComponent<VideoState>; keyboard: IoComponent }) {
        this.video = video;
        this.keyboard = keyboard;

        this.pia = new PIA6820();
        this.pia.name = 'Peripheral Interface Adapter (PIA 6820)';
        this.keyboardLogic = new KeyboardLogic(this.pia);
        this.displayLogic = new DisplayLogic(this.pia);
        this.pia.wireIOA(this.keyboardLogic);
        this.pia.wireIOB(this.displayLogic);

        // Woz Monitor ROM ($FF00–$FFFF)
        this.rom = new ROM();
        this.rom.name = 'Monitor ROM';
        this.rom.id = 'rom';
        this.rom.flash(wozMonitor);

        // RAM $0000–$0FFF (4KB)
        this.ramBank1 = new RAM(0x1000);
        this.ramBank1.name = 'Main RAM';
        this.ramBank1.id = 'ram1';

        // RAM $1000–$3FFF (12KB)
        this.ramBank1b = new RAM(0x3000);
        this.ramBank1b.name = 'A1C RAM';
        this.ramBank1b.id = 'ram1b';

        // RAM $E000–$EFFF (4KB, dla Integer BASIC, Applesoft)
        this.ramBank2 = new RAM(0x1000);
        this.ramBank2.name = 'Extended RAM';
        this.ramBank2.id = 'ram2';

        // Cartridge $4000–$BFFF (32KB bankowany ROM/RAM)
        this.cartridge = new CartridgeMemory();

        this.busMapping = [
            { addr: [0xff00, 0xffff] as [number, number], component: this.rom,      name: 'WozMonitorROM' },
            { addr: [0x0000, 0x0fff] as [number, number], component: this.ramBank1,  name: 'RAM_MAIN' },
            { addr: [0x1000, 0x3fff] as [number, number], component: this.ramBank1b, name: 'RAM_A1C' },
            { addr: [0xe000, 0xefff] as [number, number], component: this.ramBank2,  name: 'RAM_EXT' },
            { addr: [0x4000, 0xbfff] as [number, number], component: this.cartridge, name: 'CARTRIDGE' },
            { addr: [0xd010, 0xd013] as [number, number], component: this.pia,       name: 'PIA6820' },
        ];

        this.bus = new Bus(this.busMapping);
        this.bus.name = 'System Bus (A1C)';

        this.cpu = new CPU6502(this.bus);
        this.cpu.name = '6502 CPU';

        this.keyboard.wire({
            write: async (value) => this.keyboardLogic.write(value),
        });

        this.keyboardLogic.wire({
            reset: () => {
                this.pia.reset();
                this.displayLogic.reset();
                this.cpu.reset();
            },
        });

        this.displayLogic.wire({
            write: (value: string | number) => this.video.write(value),
            reset: () => this.video.reset(),
        });

        this.clock = new Clock(CPU_SPEED_MHZ, CPU_STEP_INTERVAL_MS);
        this.clock.name = 'System Clock';
        this.clock.subscribe((steps: number) => this.cpu.performBulkSteps(steps));

        this.cpu.reset();
        loggingService.info('Apple1Cartridge', 'Apple 1 + A1C Cartridge emulator initialized');
    }

    /** Załaduj wsad ROM i zresetuj cały system */
    loadCartridgeROM(data: Uint8Array): void {
        this.cartridge.loadROM(data);
        this.reset();
        loggingService.info('Apple1Cartridge', `ROM loaded: ${data.length} bytes`);
    }

    reset(): void {
        this.pia.reset();
        this.displayLogic.reset();
        this.cpu.reset();
    }

    async startLoop(): Promise<void> {
        return this.clock.startLoop();
    }

    // Uproszczone metody stanu (kompatybilność z WorkerAPI)
    saveEmulatorState() {
        return {
            ram: [
                { id: this.ramBank1.id, state: this.ramBank1.saveState() },
                { id: this.ramBank2.id, state: this.ramBank2.saveState() },
            ],
            cpu: this.cpu.saveState(),
            pia: this.pia.saveState(),
        };
    }

    loadEmulatorState(state: ReturnType<Apple1Cartridge['saveEmulatorState']>) {
        if (state.cpu) this.cpu.loadState(state.cpu);
        if (state.pia) this.pia.loadState(state.pia as Parameters<PIA6820['loadState']>[0]);
    }
}

export default Apple1Cartridge;
