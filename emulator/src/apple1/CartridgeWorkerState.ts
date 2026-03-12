import Apple1Cartridge from './Apple1Cartridge';
import WebWorkerKeyboard from './WebKeyboard';
import WebCRTVideo from './WebCRTVideo';

export class CartridgeWorkerState {
    public readonly video: WebCRTVideo;
    public readonly keyboard: WebWorkerKeyboard;
    public readonly apple1: Apple1Cartridge;

    public breakpoints: Set<number> = new Set();
    public runToCursorTarget: number | null = null;
    public isPaused: boolean = false;
    public isStepping: boolean = false;
    public debuggerActive: boolean = false;
    public debugUpdateInterval: number | null = null;

    constructor() {
        this.video = new WebCRTVideo();
        this.keyboard = new WebWorkerKeyboard();
        this.apple1 = new Apple1Cartridge({ video: this.video, keyboard: this.keyboard });
    }

    updateBreakpointHook(): void {
        // simplified — no breakpoints in cartridge mode
    }

    cleanup(): void {
        this.apple1.clock.stopLoop();
    }
}
