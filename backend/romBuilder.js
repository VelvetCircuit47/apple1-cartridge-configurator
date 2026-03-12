/**
 * ROM Builder for Apple-1 Cartridge
 *
 * Key insight: multiple entries share the same binary files.
 * e.g. applesoft-lite.bin is used by "applesoft", "lemo" and "count10".
 * We must deduplicate — each unique file is placed once in ROM,
 * and segments point into it via (fileBase + binOffset).
 *
 * ROM layout:
 *   $0000 (phys) = $4000 (logical): Loader program (2KB)
 *   $0800 (phys) = $4800 (logical): Entry table + deduplicated binary content
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = '/home/user/apple1-cartridge-repo';
const XA_BIN     = join(__dirname, 'xa');

const CONTENT_BASE_LOGICAL = 0x4800;
const ROM_SIZE             = 0x8000; // 32KB AT28C256
const LOADER_PATH          = join(REPO_ROOT, 'cartridge.bin');

/**
 * Build the loader binary using the bundled xa assembler if loader is missing.
 */
export function ensureLoader() {
  if (existsSync(LOADER_PATH)) return;
  if (!existsSync(XA_BIN)) return; // no xa available, skip
  console.log('Building loader with xa...');
  execSync(
    `${XA_BIN} -M -W -C -O ASCII -c src/cartridge.a65 -l cartridge.label -o cartridge.bin`,
    { cwd: REPO_ROOT, stdio: 'pipe' }
  );
  console.log('Loader built:', LOADER_PATH);
}

function calcEntryTableSize(entries) {
  let size = 1; // num_entries
  for (const entry of entries) {
    size += 1;                                           // num_segments
    size += entry.segments.length * 6;                  // 3 words per segment
    size += 1 + Buffer.byteLength(entry.name, 'ascii'); // str_len + str
    size += 2;                                           // jump_addr
  }
  return size;
}

/**
 * Build a deduplicated content layout.
 * Returns:
 *   contentBufs  — array of Buffers to concatenate after the entry table
 *   Each seg gets seg._romAddr assigned.
 */
function assignRomAddresses(entries, tableEndAddr) {
  // Map: binFile path → { romAddr, data }
  // For inline bytes: use a unique key per label
  const fileMap = new Map();
  let cursor = tableEndAddr;

  for (const entry of entries) {
    for (const seg of entry.segments) {
      if (seg.inlineBytes) {
        // Inline bytes are unique per label — always place separately
        const key = `inline:${entry.id}:${seg.contentLabel}`;
        if (!fileMap.has(key)) {
          const buf = Buffer.from(seg.inlineBytes);
          fileMap.set(key, { romAddr: cursor, data: buf });
          cursor += buf.length;
        }
        const rec = fileMap.get(key);
        seg._romAddr = rec.romAddr + (seg.binOffset || 0);
      } else {
        // File-backed content — deduplicate by file path
        const filePath = seg.binFile;
        if (!fileMap.has(filePath)) {
          const data = readFileSync(filePath);
          fileMap.set(filePath, { romAddr: cursor, data });
          cursor += data.length;
        }
        const rec = fileMap.get(filePath);
        seg._romAddr = rec.romAddr + (seg.binOffset || 0);
      }
    }
  }

  const contentBufs = [...fileMap.values()].map(r => r.data);
  return { contentBufs, totalSize: cursor - tableEndAddr };
}

function buildEntryTable(entries, tableSize) {
  const buf = Buffer.alloc(tableSize, 0xff);
  let pos = 0;

  buf.writeUInt8(entries.length, pos++);

  for (const entry of entries) {
    buf.writeUInt8(entry.segments.length, pos++);
    for (const seg of entry.segments) {
      buf.writeUInt16LE(seg.length, pos);    pos += 2;
      buf.writeUInt16LE(seg.destAddr, pos);  pos += 2;
      buf.writeUInt16LE(seg._romAddr, pos);  pos += 2;
    }
    const nameBytes = Buffer.from(entry.name, 'ascii');
    buf.writeUInt8(nameBytes.length, pos++);
    nameBytes.copy(buf, pos);
    pos += nameBytes.length;
    buf.writeUInt16LE(entry.jumpAddr, pos);  pos += 2;
  }

  return buf;
}

export function buildRom(entries) {
  if (entries.length > 99) throw new Error('Maximum 99 entries allowed');
  ensureLoader();

  const tableSize    = calcEntryTableSize(entries);
  const tableEndAddr = CONTENT_BASE_LOGICAL + tableSize;

  const { contentBufs, totalSize } = assignRomAddresses(entries, tableEndAddr);

  const available = ROM_SIZE - 0x0800; // bytes from $4800 to end of ROM
  if (tableSize + totalSize > available) {
    throw new Error(
      `Content too large: ${tableSize + totalSize} bytes, max ${available} bytes`
    );
  }

  const tableBuf     = buildEntryTable(entries, tableSize);
  const contentRegion = Buffer.concat([tableBuf, ...contentBufs]);

  const rom = Buffer.alloc(ROM_SIZE, 0xff);

  if (existsSync(LOADER_PATH)) {
    const loader = readFileSync(LOADER_PATH);
    loader.copy(rom, 0, 0, Math.min(loader.length, 0x0800));
  }

  contentRegion.copy(rom, 0x0800);
  return rom;
}

export function buildContentOnly(entries) {
  if (entries.length > 99) throw new Error('Maximum 99 entries allowed');

  const tableSize    = calcEntryTableSize(entries);
  const tableEndAddr = CONTENT_BASE_LOGICAL + tableSize;

  const { contentBufs } = assignRomAddresses(entries, tableEndAddr);
  const tableBuf = buildEntryTable(entries, tableSize);

  return Buffer.concat([tableBuf, ...contentBufs]);
}
