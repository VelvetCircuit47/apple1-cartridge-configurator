/**
 * Entry point dla wariantu emulatora z obsługą karty A1C Cartridge.
 * Renderuje minimalny interfejs (tylko ekran CRT) i obsługuje postMessage
 * do załadowania wsadu ROM z konfiguratora.
 */
import { createRoot } from 'react-dom/client';
import { useState, useEffect, useRef, JSX } from 'react';
import * as Comlink from 'comlink';
import CRT from './components/CRT';
import type { VideoData } from './apple1/types/video';
import type { CartridgeAPI } from './apple1/Apple.cartridge.worker.comlink';

const DEFAULT_VIDEO: VideoData = { buffer: [[0, ['']]], row: 0, column: 0 };

function CartridgeEmulatorApp(): JSX.Element {
    const [videoData, setVideoData] = useState<VideoData>(DEFAULT_VIDEO);
    const [status, setStatus] = useState<string>('Inicjalizacja...');
    const apiRef = useRef<Comlink.Remote<CartridgeAPI> | null>(null);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Uruchom worker
        const worker = new Worker(
            new URL('./apple1/Apple.cartridge.worker.comlink.ts', import.meta.url),
            { type: 'module' }
        );
        workerRef.current = worker;
        const api = Comlink.wrap<CartridgeAPI>(worker);
        apiRef.current = api;

        // Subskrybuj wideo
        api.onVideoUpdate(Comlink.proxy((data: VideoData) => {
            setVideoData(data);
        }));

        setStatus('Gotowy — oczekuję na ROM z konfiguratora');

        // Powiadom rodzica (iframe parent) że emulator jest gotowy
        window.parent.postMessage({ type: 'EMULATOR_READY' }, '*');

        // Obsługa wiadomości postMessage z konfiguratora
        const handleMessage = async (e: MessageEvent) => {
            if (e.data?.type === 'RESET_EMULATOR') {
                setStatus('Resetowanie...');
                await api.reset();
                setStatus('Zresetowano — wpisz 4000R aby uruchomić menu');
                return;
            }
            if (e.data?.type === 'LOAD_CARTRIDGE_ROM' && Array.isArray(e.data.data)) {
                setStatus('Ładowanie ROM...');
                try {
                    await api.loadCartridgeROM(e.data.data);
                    setStatus('ROM załadowany — wpisz 4000R aby uruchomić menu');
                    window.parent.postMessage({ type: 'EMULATOR_ROM_LOADED' }, '*');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setStatus('Błąd: ' + msg);
                    window.parent.postMessage({ type: 'EMULATOR_ERROR', message: msg }, '*');
                }
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
            worker.terminate();
        };
    }, []);

    // Obsługa klawiatury
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!apiRef.current) return;
        e.preventDefault();
        const key = e.key;
        if (key === 'Enter') apiRef.current.keyDown('Enter');
        else if (key === 'Backspace') apiRef.current.keyDown('Backspace');
        else if (key === 'Escape') apiRef.current.keyDown('Escape');
        else if (key.length === 1) apiRef.current.keyDown(key);
    };

    return (
        <div
            style={{
                background: '#050d05',
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                outline: 'none',
            }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            // Automatyczny focus
            ref={(el) => el?.focus()}
        >
            <CRT videoData={videoData} />
            <p style={{ color: '#3a6a3a', fontFamily: 'monospace', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {status}
            </p>
        </div>
    );
}

const container = document.getElementById('app');
if (container) {
    createRoot(container).render(<CartridgeEmulatorApp />);
}
