import { getExpTableCelestial, getExpTableNormal, getSpiralTable } from './crypto-material-store';

// ---------------------------------------------------------------------------
// 0xBBF Challenge-Response — Anti-Tamper Hash System
//
// The server sends a challenge packet (opcode 0xBBF). The client computes a
// value locally (no response is sent back). This value replaces the hash byte
// calculation for ALL subsequent packets, both outgoing and incoming.
//
// ---------------------------------------------------------------------------

/**
 * Reads a signed 32-bit integer from the buffer at the given byte offset.
 * The challenge packet uses int32 fields for the algorithm inputs.
 */
const readInt32 = (buf: Buffer, offset: number): number => buf.readInt32LE(offset);

/**
 * Reads an unsigned 32-bit integer from the buffer at the given byte offset.
 */
const readUInt32 = (buf: Buffer, offset: number): number => buf.readUInt32LE(offset);

/**
 * Computes the challenge value from a 0xBBF packet.
 *
 * The algorithm selector is derived from two fields in the packet:
 *   selector = ((pkt[0xB0] / 3) * 7 + 0xDC + (pkt[0xAC] / 7) * 3) % 3
 *
 * Based on the selector, one of three algorithms is used:
 *   0 → Index lookup from embedded packet data array
 *   1 → Exp table lookup (table chosen by evolution tier)
 *   2 → Spiral table lookup via nested indexing
 *
 * @param buffer  Raw packet buffer (already decrypted by TcpClient)
 * @param evolutionTier  0=Mortal, 1=SubCelestial, 2=Celestial
 * @returns The computed challenge value (stored in PacketSecurity as challengeValue)
 */
export const computeChallengeValue = (buffer: Buffer, evolutionTier: number): number => {
  if (buffer.length < 0xb4) return 0;

  const fieldAC = readInt32(buffer, 0xac);
  const fieldB0 = readInt32(buffer, 0xb0);

  // Integer division (truncate toward zero, matching C behavior)
  const selector = (Math.trunc(fieldB0 / 3) * 7 + 0xdc + Math.trunc(fieldAC / 7) * 3) % 3;

  switch (selector) {
    case 0:
      return algorithmFBC(buffer);
    case 1:
      return algorithm13BD(buffer, evolutionTier);
    case 2:
      return algorithm7BE(buffer);
    default:
      return 0;
  }
};

/**
 * Algorithm 0 (0xFBC) — Index Lookup
 * game: index = (int)~pkt[0x68] % 40 (SIGNED), clamp 23→22,
 * then read a uint32 at packet offset 0x0C + index*4.
 */
export const fbcIndex = (field68: number): number => {
  // ~ yields a signed int32 → matches (int)~field68; signed % 40; `| 0` normalizes -0 → 0 (C int).
  let index = (~field68 % 40) | 0;
  if (index === 23) index = 22;
  return index;
};

const algorithmFBC = (buffer: Buffer): number => {
  const offset = 0x0c + fbcIndex(readUInt32(buffer, 0x68)) * 4;
  if (offset < 0 || offset + 4 > buffer.length) return 0;
  return readUInt32(buffer, offset);
};

/**
 * Algorithm 1 (0x13BD) — Exp Table Lookup
 * game: index = ((int32)((pkt[0x88]+1) * pkt[0x38])) % 400 — the multiply is a
 * 32-bit signed multiply that WRAPS (Math.imul), and the % 400 is SIGNED. Then EXP_TABLE[index] ^ 0xFFFF.
 */
export const expIndex = (field88: number, field38: number): number =>
  (Math.imul(field88 + 1, field38) % 400) | 0;

const algorithm13BD = (buffer: Buffer, evolutionTier: number): number => {
  const index = expIndex(readInt32(buffer, 0x88), readInt32(buffer, 0x38));
  const table = evolutionTier === 2 ? getExpTableCelestial() : getExpTableNormal();
  if (index < 0 || index >= table.length) return 0;
  return (table[index] ^ 0xffff) >>> 0;
};

/**
 * Algorithm 2 (0x7BE) — Spiral Table Lookup
 * game: row = (int)pkt[0x84] % 4, arrayIndex = (int)pkt[0x84] % 30 (both SIGNED),
 * intermediate = (int)pkt[0x0C + arrayIndex*4], col = intermediate % 5 (SIGNED), SPIRAL[col + row*5].
 */
const algorithm7BE = (buffer: Buffer): number => {
  const field84 = readInt32(buffer, 0x84); // SIGNED
  const row = field84 % 4;
  const arrayIndex = field84 % 30;
  const interOffset = 0x0c + arrayIndex * 4;
  if (interOffset < 0 || interOffset + 4 > buffer.length) return 0;
  const col = readInt32(buffer, interOffset) % 5;
  const spiral = getSpiralTable();
  const spiralIndex = col + row * 5;
  if (spiralIndex < 0 || spiralIndex >= spiral.length) return 0;
  return spiral[spiralIndex];
};
