/**
 * Parser for apple1cartridge src/rom_content.a65
 *
 * Entry table structure at $4800:
 *   [num_entries: 1 byte]
 *   For each entry:
 *     [num_segments: 1 byte]
 *     For each segment:
 *       [length: word LE]        - bytes to copy
 *       [dest_addr: word LE]     - RAM address to load at
 *       [rom_addr: word LE]      - ROM logical address of content
 *     [str_len: 1 byte]
 *     [string: str_len bytes]
 *     [jump_addr: word LE]
 *   Binary content follows entry table
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', 'apple1-cartridge-repo');
const ROM_CONTENT_PATH = join(REPO_ROOT, 'src', 'rom_content.a65');
const INC_DIR = join(REPO_ROOT, 'inc');

function parseHex(str) {
  return parseInt(str.replace('$', ''), 16);
}

/**
 * Parse the rom_content.a65 file and return an array of program entries.
 * Each entry:
 * {
 *   id: string,
 *   name: string,           // display name
 *   segments: [{ length, destAddr, binFile, binOffset }],
 *   jumpAddr: number,
 *   available: boolean      // true if all binary files exist
 * }
 */
export function parseRomContent() {
  const src = readFileSync(ROM_CONTENT_PATH, 'utf-8');
  const lines = src.split('\n');

  // First pass: build a map of label -> binary file and offset
  // Format: label_cont .bin 0,0,"inc/file.bin"
  // Format: label_fix_cont .byt $xx,$xx,...  (inline bytes)
  const contentMap = {}; // label -> { type: 'bin'|'byt', file?, bytes? }

  const binRe = /^(\w+)\s+\.bin\s+0\s*,\s*0\s*,\s*"([^"]+)"/;
  const bytRe = /^(\w+)\s+\.byt\s+(.+)$/;

  // Find "start of binary content section" marker
  let inContentSection = false;
  for (const line of lines) {
    const trimmed = line.trim().replace(/;.*$/, '').trim();
    if (line.includes('start of binary content section')) {
      inContentSection = true;
      continue;
    }
    if (!inContentSection) continue;

    const binMatch = trimmed.match(binRe);
    if (binMatch) {
      contentMap[binMatch[1]] = { type: 'bin', file: join(REPO_ROOT, binMatch[2]) };
      continue;
    }
    const bytMatch = trimmed.match(bytRe);
    if (bytMatch) {
      const bytes = bytMatch[2].split(',').map(b => {
        const t = b.trim();
        return t.startsWith('$') ? parseInt(t.slice(1), 16) : parseInt(t, 10);
      });
      contentMap[bytMatch[1]] = { type: 'byt', bytes };
    }
  }

  // Second pass: parse entry table section
  const entries = [];
  let inEntrySection = false;

  // Patterns
  const segCountRe = /^(\w+)_seg\s+\.byt\s+\$?([0-9a-fA-F]+)/;
  const segLenRe   = /^(\w+?)(?:_\d+)?_len\s+\.word\s+\$([0-9a-fA-F]+)/;
  const segAddrRe  = /^(\w+?)(?:_\d+)?_addr\s+\.word\s+\$([0-9a-fA-F]+)/;
  const segContRe  = /^(\w+?)(?:_\d+)?_cont_start\s+\.word\s+([\w+$]+)/;
  const strRe      = /^(\w+)_str\s+\.byt\s+\$([0-9a-fA-F]+)\s*,\s*"([^"]*)"/;
  const jmpRe      = /^(\w+)_jmp_addr\s+\.word\s+\$([0-9a-fA-F]+)/;

  let currentEntry = null;
  let currentSegIdx = 0;

  for (const line of lines) {
    if (line.includes('start of loader entry table section')) {
      inEntrySection = true;
      continue;
    }
    if (line.includes('end of loader entry table section')) {
      if (currentEntry) entries.push(currentEntry);
      break;
    }
    if (!inEntrySection) continue;

    const trimmed = line.trim().replace(/;.*$/, '').trim();
    if (!trimmed) continue;

    let m;

    // num segments => new entry begins
    m = trimmed.match(segCountRe);
    if (m) {
      if (currentEntry) entries.push(currentEntry);
      const id = m[1].replace(/_seg$/, '');
      currentEntry = {
        id,
        name: '',
        segments: [],
        jumpAddr: 0,
      };
      currentSegIdx = 0;
      const numSegs = parseInt(m[2], 16);
      for (let i = 0; i < numSegs; i++) {
        currentEntry.segments.push({ length: 0, destAddr: 0, contentLabel: '' });
      }
      continue;
    }

    // jmpRe must be checked before segAddrRe to avoid false match on *_jmp_addr
    m = trimmed.match(jmpRe);
    if (m && currentEntry) {
      currentEntry.jumpAddr = parseHex('$' + m[2]);
      continue;
    }

    m = trimmed.match(segLenRe);
    if (m && currentEntry) {
      const seg = currentEntry.segments[currentSegIdx];
      if (seg) seg.length = parseHex('$' + m[2]);
      continue;
    }

    m = trimmed.match(segAddrRe);
    if (m && currentEntry) {
      const seg = currentEntry.segments[currentSegIdx];
      if (seg) seg.destAddr = parseHex('$' + m[2]);
      continue;
    }

    m = trimmed.match(segContRe);
    if (m && currentEntry) {
      const seg = currentEntry.segments[currentSegIdx];
      if (seg) {
        seg.contentLabel = m[2];
        currentSegIdx++;
      }
      continue;
    }

    m = trimmed.match(strRe);
    if (m && currentEntry) {
      currentEntry.name = m[3];
      continue;
    }
  }

  // Resolve content labels to actual files / inline bytes
  for (const entry of entries) {
    let available = true;
    // Track byte offset within a single binary file for multi-segment entries
    // that reference the same file with an offset label (e.g. memorytest_cont+16)
    const resolvedContents = {};

    for (const seg of entry.segments) {
      const labelExpr = seg.contentLabel; // e.g. "memorytest_cont+16" or "basic_cont"
      // Handle offsets like +16 (decimal) or +$B6 (hex)
      const plusMatch = labelExpr.match(/^(\w+)\+(\$[0-9a-fA-F]+|\d+)$/);
      const baseLabel = plusMatch ? plusMatch[1] : labelExpr;
      const offset = plusMatch
        ? (plusMatch[2].startsWith('$') ? parseInt(plusMatch[2].slice(1), 16) : parseInt(plusMatch[2]))
        : 0;

      const content = contentMap[baseLabel];
      if (!content) {
        available = false;
        seg.binFile = null;
        continue;
      }

      if (content.type === 'bin') {
        seg.binFile = content.file;
        seg.binOffset = offset;
        if (!existsSync(content.file)) available = false;
      } else {
        // inline bytes
        seg.inlineBytes = content.bytes.slice(offset);
        seg.binFile = null;
      }
    }

    entry.available = available;
  }

  return entries;
}

/**
 * Load binary data for a segment.
 * Returns a Buffer.
 */
export function loadSegmentData(seg) {
  if (seg.inlineBytes) return Buffer.from(seg.inlineBytes);
  if (!seg.binFile || !existsSync(seg.binFile)) {
    throw new Error(`Binary file not found: ${seg.binFile}`);
  }
  const data = readFileSync(seg.binFile);
  const start = seg.binOffset || 0;
  return data.slice(start, start + seg.length);
}
