import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRomContent } from './romParser.js';
import { buildRom, buildContentOnly, ensureLoader } from './romBuilder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR   = join(__dirname, '..', 'public');
const EMULATOR_DIR = join(PUBLIC_DIR, 'emulator');

const app = express();
app.use(cors());
app.use(express.json());

// Serwuj frontend (React build)
app.use(express.static(PUBLIC_DIR));
// Serwuj emulator Apple1JS pod /emulator/
app.use('/emulator', express.static(EMULATOR_DIR));

const LOADER_PATH = join(__dirname, '..', 'apple1-cartridge-repo', 'cartridge.bin');

// Cache last built ROM for download
let lastBuild = null; // { buffer, filename, timestamp }

/**
 * GET /programs
 * Returns list of available programs parsed from rom_content.a65
 */
app.get('/programs', (req, res) => {
  try {
    const entries = parseRomContent();
    const programs = entries.map(e => ({
      id: e.id,
      name: e.name,
      jumpAddr: `$${e.jumpAddr.toString(16).toUpperCase().padStart(4, '0')}`,
      segments: e.segments.map(s => ({
        length: s.length,
        destAddr: `$${s.destAddr.toString(16).toUpperCase().padStart(4, '0')}`,
        lengthHex: `$${s.length.toString(16).toUpperCase().padStart(4, '0')}`,
      })),
      available: e.available,
    }));
    res.json({ programs, loaderAvailable: existsSync(LOADER_PATH) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /build
 * Body: { selectedIds: string[], fullRom: boolean }
 * Generates the ROM binary for the selected programs in given order.
 */
app.post('/build', (req, res) => {
  try {
    const { selectedIds, fullRom = true } = req.body;
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({ error: 'selectedIds must be a non-empty array' });
    }

    const allEntries = parseRomContent();
    const entryMap = Object.fromEntries(allEntries.map(e => [e.id, e]));

    const selected = selectedIds.map(id => {
      const e = entryMap[id];
      if (!e) throw new Error(`Unknown program id: ${id}`);
      if (!e.available) throw new Error(`Binary files missing for program: ${e.name}`);
      return e;
    });

    if (fullRom) ensureLoader();
    const buffer = fullRom && existsSync(LOADER_PATH)
      ? buildRom(selected)
      : buildContentOnly(selected);

    const filename = fullRom && existsSync(LOADER_PATH)
      ? 'cartridge.bin'
      : 'rom_content.bin';

    lastBuild = { buffer, filename, timestamp: Date.now() };

    res.json({
      success: true,
      size: buffer.length,
      filename,
      programCount: selected.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /download
 * Downloads the last built ROM binary.
 */
app.get('/download', (req, res) => {
  if (!lastBuild) {
    return res.status(404).json({ error: 'No ROM built yet. Use POST /build first.' });
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${lastBuild.filename}"`);
  res.send(lastBuild.buffer);
});

// SPA fallback — wszystkie nieznane ścieżki → index.html (poza /emulator/)
app.get(/^(?!\/emulator).*/, (req, res) => {
  const indexPath = join(PUBLIC_DIR, 'index.html');
  if (existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Frontend not built. Run: npm run build in frontend/');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Apple-1 Cartridge Configurator backend running on http://localhost:${PORT}`);
});
