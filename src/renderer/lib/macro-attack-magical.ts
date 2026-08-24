import type { MPosition } from '@shared/types';
import {
  DEFAULT_ATTACK_RANGE,
  MAGICAL_INTER_CAST_DELAY_MS,
  ROTATION_SLOT_COUNT,
} from '@shared/constants/attack';
import { attackDistance } from '@shared/lib/movement-math';
import { useAppConfigStore } from '../stores/app-config-store';
import { useGameStore } from '../stores/game-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { getSkill } from './item-db';
import { isSummon } from './entity-selectors';
import { ACTION_HORIZON_DEFAULT, isEntityActionable } from './entity-freshness';
import { getEntityLivePosition } from './entity-position';
import { registerAmbientModule } from './macro-engine';
import { emitMacroEvent } from './macro-events';
import { logMacro } from './macro-log';
import {
  createAttackEngagement,
  normalizeEntityName,
  type AttackPolicy,
  type Target,
} from './macro-attack-engagement';
import { pickSkillTargets } from './skill-target-fanout';

const cooldownMap = new Map<number, number>();
let lastAnyCastAt = 0;

// Dedupe identical skip reasons across consecutive ticks (executeAttack runs at 4Hz).
let lastSkipKey: string | null = null;

const logSkip = (key: string, message: string): void => {
  if (lastSkipKey === key) return;
  lastSkipKey = key;
  logMacro('warn', `[attack-magical] ${message}`);
};

/** Offensive skill eligible for the magical rotation (single or multi-target). */
const isOffensiveSkill = (row: { hitsEnemies: number }): boolean => row.hitsEnemies === 1;

const collectFanoutCandidates = (
  playerPos: MPosition,
  whitelistLower: ReadonlySet<string>,
  horizon: number,
): { index: number; pos: MPosition }[] => {
  const lastTeleportMs = usePlayerStore.getState().lastTeleportMs;
  const out: { index: number; pos: MPosition }[] = [];
  for (const e of useGameStore.getState().entities) {
    if (e.category !== 'monster' || isSummon(e)) continue;
    if (whitelistLower.size > 0 && !whitelistLower.has(normalizeEntityName(e.name))) continue;
    if (
      !isEntityActionable(e, {
        lastTeleportMs,
        playerPos,
        horizon,
      })
    ) {
      continue;
    }
    out.push({ index: e.index, pos: getEntityLivePosition(e) });
  }
  return out;
};

const magicalPolicy: AttackPolicy = {
  name: 'attack-magical',
  mode: 'magical',
  // Approach range = the rotation's MAX skill castRange; each skill then fires only
  // within its own castRange (the per-skill gate in executeAttack). Derived from
  // SkillData (+0x10) — the config attackRange is physical-only.
  getRange: (): number => {
    const slots = useAppConfigStore.getState().config.attack?.rotation?.slots ?? [];
    let max = 0;
    for (const slot of slots) {
      if (slot == null) continue;
      const row = getSkill(slot.skillId)?.row;
      if (!row || !isOffensiveSkill(row)) continue;
      if (row.castRange > max) max = row.castRange;
    }
    return max > 0 ? max : DEFAULT_ATTACK_RANGE;
  },
  executeAttack: (target: Target, playerPos: MPosition): void => {
    const now = Date.now();
    if (now - lastAnyCastAt < MAGICAL_INTER_CAST_DELAY_MS) return;

    const attack = useAppConfigStore.getState().config.attack;
    const slots = attack?.rotation?.slots ?? [];
    const filledCount = slots.filter((s) => s !== null).length;
    if (filledCount === 0) {
      logSkip('empty-rotation', 'rotação vazia — preencha pelo menos um slot');
      return;
    }

    const whitelistLower = new Set(
      (attack?.monsters ?? []).map((m) => normalizeEntityName(m.name)),
    );
    const dist = attackDistance(playerPos, target.pos);
    // Same attention radius as engagement; expand so secondaries near the primary
    // are not dropped solely by a tight detection horizon.
    const detectionRadius = attack?.targeting?.detectionRadius ?? ACTION_HORIZON_DEFAULT;
    const candidates = collectFanoutCandidates(
      playerPos,
      whitelistLower,
      Math.max(detectionRadius, dist, 1),
    );

    const rejections: string[] = [];
    let allInCooldown = true;

    for (let priority = 1; priority <= ROTATION_SLOT_COUNT; priority++) {
      const slot = slots[priority - 1];
      if (slot == null) continue;
      const row = getSkill(slot.skillId)?.row;
      if (!row) {
        rejections.push(
          `slot ${priority} (id=${slot.skillId}): skill desconhecida em SkillData.bin`,
        );
        allInCooldown = false;
        continue;
      }
      if (!isOffensiveSkill(row)) {
        rejections.push(
          `slot ${priority} (id=${slot.skillId}): não ofensiva — hitsEnemies=${row.hitsEnemies}`,
        );
        allInCooldown = false;
        continue;
      }
      // Per-skill range: only fire if the target is within THIS skill's castRange
      // (SkillData +0x10). The FSM approached to the rotation's MAX castRange, so a
      // shorter-range skill can still be out of its own range — skip to the next.
      if (dist > row.castRange) {
        allInCooldown = false;
        continue;
      }
      const lastCast = cooldownMap.get(slot.skillId) ?? 0;
      const cooldownMs = row.cooldownSecs * 1000;
      if (now - lastCast < cooldownMs) continue;

      const targetIds = pickSkillTargets({
        skillId: slot.skillId,
        packetKind: row.packetKind,
        castRange: row.castRange,
        primary: { index: target.index, pos: target.pos },
        playerPos,
        candidates,
      });
      const extraTargetIndexes = targetIds.slice(1);

      gameApi.attack(target.index, target.pos, slot.skillId, {
        packetKind: row.packetKind,
        extraTargetIndexes: extraTargetIndexes.length > 0 ? extraTargetIndexes : undefined,
      });
      cooldownMap.set(slot.skillId, now);
      lastAnyCastAt = now;
      lastSkipKey = null;
      const multi =
        extraTargetIndexes.length > 0
          ? ` multi=[${targetIds.join(',')}] pk=${row.packetKind}`
          : ` pk=${row.packetKind}`;
      logMacro(
        'info',
        `[attack-magical] disparou skill id=${slot.skillId} slot=${priority} cd=${row.cooldownSecs}s${multi}`,
      );
      emitMacroEvent({
        kind: 'skillCastFired',
        source: 'attack-magical',
        skillId: slot.skillId,
        priority,
        cooldownEndsMs: now + cooldownMs,
      });
      return;
    }

    if (rejections.length > 0) {
      logSkip(
        `reject:${rejections.join('|')}`,
        `nenhuma skill compatível na rotação:\n  - ${rejections.join('\n  - ')}`,
      );
    } else if (allInCooldown) {
      logSkip('all-cd', 'todas as skills da rotação estão em cooldown');
    }
  },
  reset: (): void => {
    cooldownMap.clear();
    lastAnyCastAt = 0;
    lastSkipKey = null;
  },
};

registerAmbientModule(createAttackEngagement(magicalPolicy));
