/**
 * Parser for `resources/itemhelp.dat`.
 *
 *   - Plain Latin-1 text. No encryption.
 *   - Block-oriented; up to 6500 item blocks, in arbitrary id order.
 *   - Header line: `<itemId> [<count>]` (sscanf "%d %d"). Count column may be absent.
 *   - Up to 9 colored text lines per block:
 *       <hex-color-prefix><space|tab><text...>
 *     Spec said 4-hex-digits; on-disk file uses 8 hex digits. sscanf "%x"
 *     consumes the full run; game masks to u16 (`color & 0xffff`).
 *   - Block ordering on disk is NOT positional — id comes from each header.
 */

const MAX_LINES_PER_BLOCK = 9;

export interface ItemHelpLine {
  /** u16 color (masked to 16 bits per game storage). */
  color: number;
  text: string;
}

export interface ItemHelp {
  /** Header `count` field — typically 0 in practice (column is absent in the file). */
  count: number;
  lines: ItemHelpLine[];
}

const isHeaderLine = (line: string): boolean => /^\s*\d+(\s+\d+)?\s*$/.test(line);

const parseColoredLine = (line: string): ItemHelpLine | null => {
  // Match a hex-digit run + whitespace separator + remaining text.
  const m = line.match(/^([0-9A-Fa-f]+)[ \t](.*)$/);
  if (!m) return null;
  const color = parseInt(m[1]!, 16);
  if (Number.isNaN(color)) return null;
  return { color: color & 0xffff, text: m[2]! };
};

export const parseItemhelpDat = (buffer: Buffer): Map<number, ItemHelp> => {
  // Latin-1 keeps all bytes 1:1, including pre-mapped Portuguese glyphs.
  const text = buffer.toString('latin1');
  const rawLines = text.split(/\r\n|\r|\n/);

  const out = new Map<number, ItemHelp>();
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line === undefined || line.trim() === '') {
      i += 1;
      continue;
    }

    if (!isHeaderLine(line)) {
      // Defensive: orphan colored line outside any block.
      i += 1;
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const itemId = Number.parseInt(parts[0]!, 10);
    const count = parts.length > 1 ? Number.parseInt(parts[1]!, 10) : 0;
    i += 1;

    const lines: ItemHelpLine[] = [];
    for (let slot = 0; slot < MAX_LINES_PER_BLOCK; slot += 1) {
      if (i >= rawLines.length) break;
      const candidate = rawLines[i]!;
      if (isHeaderLine(candidate) && candidate.trim() !== '') break;
      const parsed = parseColoredLine(candidate);
      if (parsed) lines.push(parsed);
      // Even malformed/blank lines consume a slot — canonical reader advances
      // 1 line per inner iteration regardless of parse outcome.
      i += 1;
    }

    if (Number.isFinite(itemId)) {
      out.set(itemId, { count: Number.isFinite(count) ? count : 0, lines });
    }
  }

  return out;
};
