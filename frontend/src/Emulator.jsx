/**
 * Emulator — osadzony emulator Apple-1 z obsługą karty A1C Cartridge.
 * Komunikuje się z Apple1JS przez postMessage (iframe).
 */
import { useEffect, useRef, useState } from 'react';

const PROGRAM_NOTES = [
  { id: 'basic',        how: 'Wpisz program lub załaduj gotowy. Uruchamia się od razu przy znaku zachęty >.' },
  { id: 'apple30th',   how: 'Demo uruchamia się automatycznie po załadowaniu.' },
  { id: 'memorytest',  how: 'Wraca do monitora Woza (\\). Wpisz 0280R, aby uruchomić test pamięci.' },
  { id: 'krusader',    how: 'Ładuje się pod $7100. Interfejs asemblera Krusader startuje automatycznie.' },
  { id: 'disassembler',how: 'Po wyborze z menu wraca do monitora Woza (\\). Wpisz 0800R, aby uruchomić deasembler.' },
  { id: 'applesoft',   how: 'Applesoft startuje przy znaku zachęty ]. Wpisz program lub RUN.' },
  { id: 'matrix',      how: 'Ładuje program do Integer BASICa. Wpisz RUN przy znaku zachęty >.' },
  { id: 'lemo',        how: 'Applesoft startuje przy znaku zachęty ]. Wpisz RUN, aby uruchomić symulator.' },
  { id: 'count10',     how: 'Applesoft startuje przy znaku zachęty ]. Wpisz RUN, aby uruchomić program.' },
];

const EMULATOR_ORIGIN = ''; // same origin

export default function Emulator({ onClose, selectedPrograms = [] }) {
    const iframeRef = useRef(null);
    const [status, setStatus] = useState('loading'); // loading | ready | running
    const [log, setLog]   = useState('Ładowanie emulatora...');

    // Kiedy iframe załaduje się, wyślij ROM
    useEffect(() => {
        const handler = (e) => {
            if (e.data?.type === 'EMULATOR_READY') {
                setStatus('ready');
                setLog('Emulator gotowy. Ładuję ROM...');
                sendROM();
            }
            if (e.data?.type === 'EMULATOR_ROM_LOADED') {
                setStatus('running');
                setLog('ROM załadowany. Menu uruchamia się automatycznie...');
            }
            if (e.data?.type === 'EMULATOR_ERROR') {
                setStatus('error');
                setLog('Błąd: ' + e.data.message);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    async function sendROM() {
        try {
            const res = await fetch('/download');
            if (!res.ok) throw new Error('Brak zbudowanego ROM — najpierw kliknij Build ROM');
            const buf = await res.arrayBuffer();
            const arr = Array.from(new Uint8Array(buf));
            iframeRef.current?.contentWindow?.postMessage(
                { type: 'LOAD_CARTRIDGE_ROM', data: arr },
                '*'
            );
        } catch (err) {
            setStatus('error');
            setLog('Błąd: ' + err.message);
        }
    }

    return (
        <div className="emulator-overlay">
            <div className="emulator-modal">
                <div className="emulator-header">
                    <span>Apple-1 + A1C Cartridge — Emulator</span>
                    <div className="emulator-header-right">
                        <span className={`emu-status emu-status-${status}`}>
                            {status === 'loading' && 'Ładowanie...'}
                            {status === 'ready'   && 'Gotowy'}
                            {status === 'running' && 'Działa'}
                            {status === 'error'   && 'Błąd'}
                        </span>
                        <button className="emu-close" onClick={onClose}>✕</button>
                    </div>
                </div>
                <div className="emulator-hint">{log}</div>
                <div className="emulator-body">
                    <iframe
                        ref={iframeRef}
                        src="/emulator/"
                        title="Apple-1 Emulator"
                        className="emulator-frame"
                        sandbox="allow-scripts allow-same-origin"
                    />
                    <div className="emulator-guide">
                        <button
                            className="emu-reset-big"
                            onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: 'RESET_EMULATOR' }, '*')}
                            disabled={status === 'loading'}
                        >
                            ↺ RESET
                        </button>
                        <div className="guide-scroll">
                        <div className="guide-section">
                            <div className="guide-title">Jak zacząć</div>
                            <div className="guide-step guide-tip">
                                Menu kartridżu uruchamia się automatycznie. Kliknij <strong>RESET</strong> aby uruchomić ponownie.
                            </div>
                            <div className="guide-step">
                                Emulator uruchamia się w <span className="guide-mono">monitorze Woza</span> — zobaczysz znak zachęty <span className="guide-mono">\</span>.
                            </div>
                            <div className="guide-step">
                                Po uruchomieniu menu wpisz numer slotu i naciśnij <span className="guide-key">Enter</span>.
                            </div>
                            <div className="guide-step guide-tip">
                                Wskazówka: <span className="guide-key">4300R</span> otwiera szybki loader — pomija menu i uruchamia slot bezpośrednio (np. wpisz <span className="guide-mono">02</span> dla slotu 2).
                            </div>
                        </div>
                        <div className="guide-section">
                            <div className="guide-title">Załadowane programy</div>
                            {selectedPrograms.map((p, i) => {
                                const note = PROGRAM_NOTES.find(n => n.id === p.id);
                                return (
                                    <div key={p.id} className="guide-program">
                                        <div className="guide-program-name">
                                            <span className="guide-slot">{i + 1}.</span> {p.name}
                                        </div>
                                        {note && <div className="guide-program-how">{note.how}</div>}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="guide-section">
                            <div className="guide-title">Monitor Woza — skrót</div>
                            <div className="guide-cmd"><span className="guide-key">XXXXR</span> uruchom od adresu XXXX</div>
                            <div className="guide-cmd"><span className="guide-key">XXXX</span> podgląd adresu</div>
                            <div className="guide-cmd"><span className="guide-key">XXXX.YYYYR</span> uruchom zakres</div>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
