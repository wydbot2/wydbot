/**
 * parseMovePacket wire decode → ipc-event-bridge self-echo classifier.
 *
 * Defect: src/main/protocol/packet-parsers.ts:368
 *   `moveType: r.readUInt32(),`
 *   The 0x36C MoveType field at offset 16 is a SIGNED Int32 on the wire,
 *   and negative values are a canonical NO-OP (moveType < 0 → no handler
 *   invoked). Reading it UNSIGNED turns a server-sent
 *   -1 (0xFFFFFFFF) into 4294967295.
 *
 *   The bridge teleport guard is `isSelfEcho && data.moveType !== 0`
 *   (ipc-event-bridge.ts:234). 4294967295 !== 0 is TRUE → the no-op packet falls
 *   into the TELEPORT branch → applyRubberband(destiny) (hard re-anchor of
 *   _confirmedTile, drops the predicted leg + routes, epoch++ at
 *   movement-state.ts:108-113) + IPC.TELEPORT → renderer markTeleport +
 *   positionReset macro event (cancelAllPending, plan abort). The canonical
 *   client does NOTHING. Net: client/server diverge on whether a reposition
 *   occurred, and queued MOVEs are dropped by the epoch bump.
 *
 * Expected: parseMovePacket(buf with int32 -1).moveType === -1,
 *   and a negative moveType classifies as a NO-OP.
 * Actual:   parseMovePacket(...).moveType === 4294967295, and
 *   the bridge classifier routes it to TELEPORT.
 *
 * To fix: change packet-parsers.ts:368 `r.readUInt32()` → `r.readInt32()` (and
 *   make the bridge guard `moveType > 0` for the teleport branch). Then flip the
 *   `it.fails(...)` proofs below back to `it(...)`.
 *
 * Pure: `parseMovePacket` is a PacketReader over a Buffer — no Electron/IPC
 * singletons, no timers. Deterministic, so `it.fails` is non-flaky here.
 */
import { describe, it, expect } from 'vitest';
import { parseMovePacket } from '@main/protocol/packet-parsers';

/**
 * Classifier the bridge SHOULD apply (game dispatch):
 *  - moveType < 0 → no-op (returns 1 immediately, no handler)
 */
type SelfMoveOutcome = 'rubberband' | 'teleport' | 'noop';
const faithfulClassify = (moveType: number): SelfMoveOutcome => {
  if (moveType < 0) return 'noop';
  if (moveType === 0 || moveType === 2) return 'rubberband';
  return 'teleport';
};

/** The classifier the bridge ACTUALLY applies (ipc-event-bridge.ts:222,234). */
const actualBridgeClassify = (moveType: number): SelfMoveOutcome => {
  if (moveType === 2 || moveType === 0) return 'rubberband';
  if (moveType !== 0) return 'teleport';
  return 'noop'; // unreachable in the real code
};

/** Minimal 52-byte 0x36C move packet with a chosen raw int32 moveType at offset 16. */
const buildMoveBuffer = (rawMoveType: number): Buffer => {
  const buf = Buffer.alloc(52);
  // header: size(u16) key(u8) checksum(u8) opcode(u16) clientId(u16) timeStamp(i32) = 12 bytes
  buf.writeUInt16LE(52, 0); // size
  buf.writeUInt16LE(0x36c, 4); // opcode
  buf.writeUInt16LE(7, 6); // clientId (== playerMobIndex ⇒ self-echo)
  // lastPosition (offset 12): x,y int16
  buf.writeInt16LE(10, 12);
  buf.writeInt16LE(10, 14);
  // moveType (offset 16): raw signed int32 written, read back as UNSIGNED by the parser
  buf.writeInt32LE(rawMoveType, 16);
  // speedMove (offset 20)
  buf.writeUInt32LE(3, 20);
  // command char[24] @24, destiny @48 (int16 x,y)
  buf.writeInt16LE(99, 48);
  buf.writeInt16LE(99, 50);
  return buf;
};

describe('movetype-unsigned-misclassify — unsigned read of a signed moveType misclassifies a server no-op', () => {
  // PROOF #1 — the wire decode. SERVER-FAITHFUL assertion wrapped in it.fails:
  // a signed int32 -1 on the wire must decode to -1. parseMovePacket reads it
  // unsigned (4294967295), so this body throws and it.fails turns it green.
  // Flip to it() once packet-parsers.ts:368 reads readInt32().
  it.fails(
    'parseMovePacket decodes a wire int32 -1 as -1 (SERVER-FAITHFUL) — currently reads it unsigned',
    () => {
      const parsed = parseMovePacket(buildMoveBuffer(-1));
      expect(parsed.moveType).toBe(-1);
    },
  );

  // PROOF #2 — the end-to-end misclassification. SERVER-FAITHFUL assertion: a
  // negative moveType self-echo must be a NO-OP at the bridge. With the buggy
  // unsigned parse it lands in TELEPORT, so this body throws → it.fails passes.
  // Flip to it() once both the parse and the bridge guard are corrected.
  it.fails(
    'a negative-moveType self-echo classifies as a NO-OP (SERVER-FAITHFUL) — currently a spurious TELEPORT',
    () => {
      const parsed = parseMovePacket(buildMoveBuffer(-1));
      expect(actualBridgeClassify(parsed.moveType)).toBe('noop');
    },
  );

  // CHARACTERIZATION (green) — pins the CURRENT buggy behavior so the divergence
  // is explicit and auditable even while the it.fails proofs above stay green.
  it('CHARACTERIZATION: documents the current buggy decode + spurious teleport for -1', () => {
    const parsed = parseMovePacket(buildMoveBuffer(-1));
    // BUG: unsigned read of a signed field — should be -1.
    expect(parsed.moveType).toBe(4294967295);
    // BUG: bridge routes the canonical no-op into a hard re-anchor (epoch++ + macro reset).
    expect(actualBridgeClassify(parsed.moveType)).toBe('teleport');
    // The faithful classifier, given the TRUE wire value, does nothing.
    expect(faithfulClassify(-1)).toBe('noop');
  });

  // Non-negative inputs are unaffected: actual and faithful classifiers agree.
  // Only negative moveTypes diverge, isolating the blast radius to the no-op case.
  it('non-negative moveTypes (0, 2, 1) classify identically under both classifiers', () => {
    for (const mt of [0, 2, 1]) {
      const decoded = parseMovePacket(buildMoveBuffer(mt)).moveType;
      expect(decoded).toBe(mt); // non-negative values decode unchanged
      expect(actualBridgeClassify(decoded)).toBe(faithfulClassify(mt));
    }
  });
});
