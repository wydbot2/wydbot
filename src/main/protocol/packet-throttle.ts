/**
 * THROTTLE: Per-opcode-category rate limiter (SendPacketWrapper equivalent)
 *
 * Mirrors the original WYD.exe SendPacketWrapper behavior:
 * consecutive packets of the SAME category within 1000ms are silently dropped.
 * Alternating categories bypass the throttle.
 *
 * This is the last in-process defense before TCP — ActionQueue handles
 * priority and token-bucket pacing, PacketThrottle catches any bypass.
 */
import {
  OPCODE_MOVE,
  OPCODE_SINGLE_ATTACK,
  OPCODE_AOE_ATTACK,
  OPCODE_SKILL_ATTACK,
  OPCODE_CHAT_MESSAGE,
  OPCODE_WHISPER_MESSAGE,
  OPCODE_ACCOUNT_LOGIN,
  OPCODE_TOKEN,
  OPCODE_REQUEST_MOB_LOGIN,
  OPCODE_CHAR_LOGOUT,
} from '@shared/constants/opcodes';
import { protocolLogger } from '../logging';

const THROTTLE_INTERVAL_MS = 1000;

/** Opcodes that are never throttled (pre-game flow). */
const EXEMPT_OPCODES: ReadonlySet<number> = new Set([
  OPCODE_ACCOUNT_LOGIN,
  OPCODE_TOKEN,
  OPCODE_REQUEST_MOB_LOGIN,
  OPCODE_CHAR_LOGOUT,
]);

const getCategory = (opcode: number): string => {
  switch (opcode) {
    case OPCODE_MOVE:
      return 'MOVE';
    case OPCODE_SKILL_ATTACK: // 0x367 generic / multi-target skill cast (0xA8)
    case OPCODE_SINGLE_ATTACK:
    case OPCODE_AOE_ATTACK: // 0x39E multi-target skill cast (0x50 dual)
      return 'COMBAT';
    case OPCODE_CHAT_MESSAGE:
      return 'CHAT';
    case OPCODE_WHISPER_MESSAGE:
      return 'WHISPER';
    default:
      return 'DEFAULT';
  }
};

export class PacketThrottle {
  private lastCategory = '';
  private lastSendTime = 0;

  /**
   * Returns true if the packet should be sent, false if it should be dropped.
   * Consecutive packets of the same category within THROTTLE_INTERVAL_MS are dropped.
   */
  public shouldAllow(opcode: number): boolean {
    if (EXEMPT_OPCODES.has(opcode)) return true;

    const category = getCategory(opcode);
    const now = Date.now();
    const elapsed = now - this.lastSendTime;

    if (category === this.lastCategory && elapsed < THROTTLE_INTERVAL_MS) {
      protocolLogger.debug(
        `PacketThrottle: dropped 0x${opcode.toString(16).toUpperCase()} (${elapsed}ms, category=${category})`,
      );
      return false;
    }

    this.lastCategory = category;
    this.lastSendTime = now;
    return true;
  }

  public reset(): void {
    this.lastCategory = '';
    this.lastSendTime = 0;
  }
}
