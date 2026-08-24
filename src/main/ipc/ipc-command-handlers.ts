/**
 * BRIDGE: Renderer → Server (Electron IPC → Protocol)
 *
 * Pre-game commands (LOGIN → CHAR_LOGOUT) call ClientControl directly —
 * naturally rate-limited by the login flow.
 *
 * In-game commands (MOVE → WHISPER_MESSAGE) are routed through ActionQueue.
 * Each action's `execute` returns its own cooldownMs — the queue honors it.
 * Movement and click return cooldownMs from ClientControl (game-logic aware);
 * other actions hardcode their canonical cooldown in the handler.
 *
 * Registered once; every handler resolves its owning window's session + outbound
 * channel from the event sender, so one window's command never drives another's.
 */
import type { IpcMainEvent } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import type { TeleportScrollOutcome } from '@shared/ipc/ipc-api';
import {
  AttackPayloadSchema,
  CastBuffPayloadSchema,
  CharSelectPayloadSchema,
  ChatPayloadSchema,
  IpcLogEntrySchema,
  ItemDestroyPayloadSchema,
  ItemMovePayloadSchema,
  LoginPayloadSchema,
  UseItemPayloadSchema,
  UseTeleportScrollPayloadSchema,
  UseReturnScrollPayloadSchema,
  BankGoldPayloadSchema,
  ComposeSubmitPayloadSchema,
  ShopBuyPayloadSchema,
  MiniPopupClickPayloadSchema,
  MovePayloadSchema,
  MoveSetRoutePayloadSchema,
  NpcClickPayloadSchema,
  PartyInvitePayloadSchema,
  PartyAcceptPayloadSchema,
  TokenPayloadSchema,
  WhisperPayloadSchema,
} from '@shared/ipc/schemas';
import {
  OPCODE_MOVE,
  OPCODE_NPC_CLICK,
  OPCODE_DIALOG_CLICK,
  OPCODE_SINGLE_ATTACK,
  OPCODE_RESPAWN_EXECUTE,
  OPCODE_CHAT_MESSAGE,
  OPCODE_WHISPER_MESSAGE,
  OPCODE_ITEM_MOVE,
  OPCODE_ITEM_DESTROY,
  OPCODE_USE_ITEM,
  OPCODE_USE_ITEM_ARM,
  OPCODE_BANK_GOLD_DEPOSIT,
  OPCODE_BANK_GOLD_WITHDRAW,
  OPCODE_COMPOSE_SUBMIT,
  OPCODE_SHOP_BUY,
  OPCODE_PARTY_INVITE,
  OPCODE_PARTY_ACCEPT,
  OPCODE_PARTY_LEAVE,
  OPCODE_ZONE_PORTAL,
} from '@shared/constants/opcodes';
import { TELEPORT_SCROLL_CHANNEL_MS } from '@shared/constants/hunt-scroll-catalog';
import { ATTACK_QUEUE_COOLDOWN_MS } from '@shared/constants/attack';
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import { calcMoveCooldownMs, moveStepCount } from '@shared/lib/movement-math';
import { EActionPriority } from '@main/session';
import type { SessionCtx } from '@main/window-registry';
import { resolveLoginHardwareIdentity } from '@main/platform';
import { ipcLogger, logger } from '../logging';
import type { IpcListenFn, IpcSendFn, SafeHandlerFn } from './ipc-types';
import { secureEmptyListener, secureListener } from './secure-handler';

/** Resolve the window-owned session + outbound channel for an inbound event. */
type ResolveCtx = (event: IpcMainEvent) => SessionCtx | null;

export const registerCommandHandlers = (
  resolveCtx: ResolveCtx,
  makeSafeHandler: (send: IpcSendFn) => SafeHandlerFn,
  on: IpcListenFn,
): void => {
  // ---------------------------------------------------------------------------
  // Pre-game commands — direct, no queue
  // ---------------------------------------------------------------------------

  on(
    IPC.LOGIN,
    secureListener(
      LoginPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        makeSafeHandler(ctx.send)(async () => {
          const { adapterGuid, mac } = await resolveLoginHardwareIdentity(
            payload.hardwareIdentitySeed,
          );
          ctx.session.getControl()?.login(payload.username, payload.password, adapterGuid, mac);
        })();
      },
      IPC.LOGIN,
    ),
  );

  on(
    IPC.TOKEN_SUBMIT,
    secureListener(
      TokenPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        ctx?.session.getControl()?.sendToken(payload.password, payload.isChanging);
      },
      IPC.TOKEN_SUBMIT,
    ),
  );

  on(
    IPC.CHAR_SELECT,
    secureListener(
      CharSelectPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const control = ctx?.session.getControl();
        if (!control) {
          ipcLogger.warn(
            `CHAR_SELECT dropped: no active session control (charIndex=${payload.charIndex})`,
          );
          return;
        }
        control.enterMob(payload.charIndex);
      },
      IPC.CHAR_SELECT,
    ),
  );

  on(
    IPC.CHAR_LOGOUT,
    secureEmptyListener((event) => {
      resolveCtx(event)?.session.getControl()?.charLogout();
    }),
  );

  on(
    IPC.MINIPOPUP_CLICK,
    secureListener(
      MiniPopupClickPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        ctx?.session.getControl()?.miniPopupClick(payload.buttonIndex);
      },
      IPC.MINIPOPUP_CLICK,
    ),
  );

  on(
    IPC.RENDERER_LOG,
    secureListener(
      IpcLogEntrySchema,
      (_event, entry) => {
        logger.log({ level: entry.level, message: entry.message, category: entry.category });
      },
      IPC.RENDERER_LOG,
    ),
  );

  // ---------------------------------------------------------------------------
  // In-game commands — routed through ActionQueue (priority + dynamic cooldown)
  // ---------------------------------------------------------------------------

  // Route push (fire-and-forget, no queue): the executor slices each chunk from it later.
  on(
    IPC.MOVE_SET_ROUTE,
    secureListener(
      MoveSetRoutePayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        ctx?.session
          .getMovementState()
          ?.setRoute(payload.source, payload.tiles, payload.codes, payload.waypoints);
      },
      IPC.MOVE_SET_ROUTE,
    ),
  );

  on(
    IPC.MOVE,
    secureListener(
      MovePayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        const { session, send } = ctx;
        const queue = session.getActionQueue();
        const movementState = session.getMovementState();
        if (!queue || !movementState) {
          // Not in-world — reject now so the renderer does not burn its 5s echo floor.
          send(IPC.MOVE_REJECTED, { moveId: payload.moveId, reason: 'no-result' });
          return;
        }

        const epoch = movementState.epoch;
        // Echo-timeout estimate only; the real chunk is sliced at execute, capped at the wire size.
        const steps = Math.min(
          moveStepCount(movementState.getPredictedPosition(Date.now()), payload.destiny),
          MAX_STEP_DISTANCE,
        );
        const travelMs = calcMoveCooldownMs(steps, payload.speedMove);
        const expectedTotalMs =
          queue.remainingCooldownMs(OPCODE_MOVE) + queue.globalPendingEstimateMs() + travelMs;
        send(IPC.MOVE_ENQUEUED, { moveId: payload.moveId, expectedTotalMs });

        queue.enqueue({
          priority: EActionPriority.HIGH,
          cooldownKey: OPCODE_MOVE,
          enqueuedAt: Date.now(),
          epoch,
          estimatedCooldownMs: travelMs,
          onDrop: () => send(IPC.MOVE_REJECTED, { moveId: payload.moveId, reason: 'queue-stale' }),
          execute: () => {
            const control = session.getControl();
            // Route-driven (macro) → single-origin slice-at-execute; else legacy straight-line.
            const result =
              payload.source !== undefined
                ? control?.movement(
                    payload.source,
                    payload.destiny,
                    payload.moveType,
                    payload.speedMove,
                    payload.exact === true,
                  )
                : control?.movementStraight(payload.destiny, payload.moveType, payload.speedMove);
            if (!result) {
              send(IPC.MOVE_REJECTED, { moveId: payload.moveId, reason: 'no-result' });
              return 0;
            }
            send(IPC.MOVE_ANNOUNCED, {
              moveId: payload.moveId,
              dst: result.dst,
              cooldownMs: result.cooldownMs,
              status: result.status,
            });
            return result.cooldownMs;
          },
        });
      },
      IPC.MOVE,
    ),
  );

  on(
    IPC.NPC_CLICK,
    secureListener(
      NpcClickPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.HIGH,
          cooldownKey: OPCODE_NPC_CLICK,
          enqueuedAt: Date.now(),
          execute: () => ctx.session.getControl()?.npcClick(payload.targetMobIndex).cooldownMs ?? 0,
        });
      },
      IPC.NPC_CLICK,
    ),
  );

  on(
    IPC.USE_ZONE_PORTAL,
    secureEmptyListener((event) => {
      const ctx = resolveCtx(event);
      const queue = ctx?.session.getActionQueue();
      if (!ctx || !queue) return;
      queue.enqueue({
        priority: EActionPriority.HIGH,
        cooldownKey: OPCODE_ZONE_PORTAL,
        enqueuedAt: Date.now(),
        execute: () => ctx.session.getControl()?.useZonePortal().cooldownMs ?? 0,
      });
    }),
  );

  on(
    IPC.DIALOG_CLICK,
    secureListener(
      NpcClickPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.HIGH,
          cooldownKey: OPCODE_DIALOG_CLICK,
          enqueuedAt: Date.now(),
          execute: () => {
            ctx.session.getControl()?.dialogClick(payload.targetMobIndex);
            return 800;
          },
        });
      },
      IPC.DIALOG_CLICK,
    ),
  );

  on(
    IPC.ITEM_MOVE,
    secureListener(
      ItemMovePayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_ITEM_MOVE,
          enqueuedAt: Date.now(),
          execute: () =>
            ctx.session
              .getControl()
              ?.itemMove(
                payload.srcKind,
                payload.srcSlot,
                payload.dstKind,
                payload.dstSlot,
                payload.bankerId,
              ).cooldownMs ?? 0,
        });
      },
      IPC.ITEM_MOVE,
    ),
  );

  on(
    IPC.ITEM_DESTROY,
    secureListener(
      ItemDestroyPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_ITEM_DESTROY,
          enqueuedAt: Date.now(),
          // Stale-drop liveness: the renderer cleared the slot optimistically on
          // emit — without this echo the item ghosts until the next 0x114.
          onDrop: () =>
            ctx.send(IPC.ITEM_DESTROY_FAILED, {
              slot: payload.slot,
              itemId: payload.itemId,
              reason: 'queue-stale',
            }),
          execute: () => {
            ctx.session.getControl()?.itemDestroy(payload.slot, payload.itemId);
            return 0;
          },
        });
      },
      IPC.ITEM_DESTROY,
    ),
  );

  on(
    IPC.PARTY_INVITE,
    secureListener(
      PartyInvitePayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_PARTY_INVITE,
          enqueuedAt: Date.now(),
          execute: () => {
            ctx.session.getControl()?.partyInvite(payload.targetIndex);
            return 0;
          },
        });
      },
      IPC.PARTY_INVITE,
    ),
  );

  on(
    IPC.PARTY_ACCEPT,
    secureListener(
      PartyAcceptPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_PARTY_ACCEPT,
          enqueuedAt: Date.now(),
          execute: () => {
            ctx.session.getControl()?.partyAccept(payload.inviterIndex, payload.inviterName);
            return 0;
          },
        });
      },
      IPC.PARTY_ACCEPT,
    ),
  );

  on(
    IPC.PARTY_LEAVE,
    secureEmptyListener((event) => {
      const ctx = resolveCtx(event);
      const queue = ctx?.session.getActionQueue();
      if (!ctx || !queue) return;
      queue.enqueue({
        priority: EActionPriority.NORMAL,
        cooldownKey: OPCODE_PARTY_LEAVE,
        enqueuedAt: Date.now(),
        execute: () => {
          ctx.session.getControl()?.partyLeave();
          return 0;
        },
      });
    }),
  );

  on(
    IPC.USE_ITEM,
    secureListener(
      UseItemPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_USE_ITEM,
          enqueuedAt: Date.now(),
          execute: () =>
            ctx.session.getControl()?.useItem(payload.slot, payload.itemId, payload.feedMarker)
              .cooldownMs ?? 0,
        });
      },
      IPC.USE_ITEM,
    ),
  );

  on(
    IPC.USE_TELEPORT_SCROLL,
    secureListener(
      UseTeleportScrollPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        const { session, send } = ctx;
        const done = (outcome: TeleportScrollOutcome) =>
          send(IPC.TELEPORT_SCROLL_DONE, { scrollId: payload.scrollId, outcome });
        const queue = session.getActionQueue();
        if (!queue) {
          done('queue-stale');
          return;
        }
        // Arm (0x3AE); on success enqueue the 0x373 flush gated on the same arm key (~5s sequence).
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_USE_ITEM_ARM,
          enqueuedAt: Date.now(),
          onDrop: () => done('queue-stale'),
          execute: () => {
            const control = session.getControl();
            if (!control) {
              done('queue-stale');
              return 0;
            }
            const res = control.useTeleportScroll(
              payload.slot,
              payload.itemId,
              payload.destX,
              payload.destY,
            );
            if (res.outcome !== 'ok' || res.menuIndex === undefined) {
              done(res.outcome);
              return 0;
            }
            const menuIndex = res.menuIndex;
            queue.enqueue({
              priority: EActionPriority.NORMAL,
              cooldownKey: OPCODE_USE_ITEM_ARM,
              enqueuedAt: Date.now(),
              estimatedCooldownMs: TELEPORT_SCROLL_CHANNEL_MS,
              onDrop: () => done('queue-stale'),
              execute: () => {
                session.getControl()?.useItem(payload.slot, payload.itemId, 0, menuIndex);
                done('ok');
                return 0;
              },
            });
            return TELEPORT_SCROLL_CHANNEL_MS;
          },
        });
      },
      IPC.USE_TELEPORT_SCROLL,
    ),
  );

  on(
    IPC.USE_RETURN_SCROLL,
    secureListener(
      UseReturnScrollPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        const { session, send } = ctx;
        const done = (outcome: TeleportScrollOutcome) =>
          send(IPC.TELEPORT_SCROLL_DONE, { scrollId: payload.scrollId, outcome });
        const queue = session.getActionQueue();
        if (!queue) {
          done('queue-stale');
          return;
        }
        // Arm (0x3AE Mode=1); on success enqueue the 0x373 (+0x20=0) flush ~5s later.
        // No destination — the server owns the return point.
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_USE_ITEM_ARM,
          enqueuedAt: Date.now(),
          onDrop: () => done('queue-stale'),
          execute: () => {
            const control = session.getControl();
            if (!control) {
              done('queue-stale');
              return 0;
            }
            const res = control.useReturnScroll(payload.slot, payload.itemId);
            if (res.outcome !== 'ok') {
              done(res.outcome);
              return 0;
            }
            queue.enqueue({
              priority: EActionPriority.NORMAL,
              cooldownKey: OPCODE_USE_ITEM_ARM,
              enqueuedAt: Date.now(),
              estimatedCooldownMs: TELEPORT_SCROLL_CHANNEL_MS,
              onDrop: () => done('queue-stale'),
              execute: () => {
                session.getControl()?.useItem(payload.slot, payload.itemId, 0, 0);
                done('ok');
                return 0;
              },
            });
            return TELEPORT_SCROLL_CHANNEL_MS;
          },
        });
      },
      IPC.USE_RETURN_SCROLL,
    ),
  );

  on(
    IPC.BANK_GOLD_DEPOSIT,
    secureListener(
      BankGoldPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_BANK_GOLD_DEPOSIT,
          enqueuedAt: Date.now(),
          execute: () => ctx.session.getControl()?.bankDepositGold(payload.amount).cooldownMs ?? 0,
        });
      },
      IPC.BANK_GOLD_DEPOSIT,
    ),
  );

  on(
    IPC.BANK_GOLD_WITHDRAW,
    secureListener(
      BankGoldPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_BANK_GOLD_WITHDRAW,
          enqueuedAt: Date.now(),
          execute: () => ctx.session.getControl()?.bankWithdrawGold(payload.amount).cooldownMs ?? 0,
        });
      },
      IPC.BANK_GOLD_WITHDRAW,
    ),
  );

  on(
    IPC.COMPOSE_SUBMIT,
    secureListener(
      ComposeSubmitPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_COMPOSE_SUBMIT,
          enqueuedAt: Date.now(),
          execute: () =>
            ctx.session.getControl()?.composeSubmit(payload.recipeIndex, payload.ingredients)
              .cooldownMs ?? 0,
        });
      },
      IPC.COMPOSE_SUBMIT,
    ),
  );

  on(
    IPC.SHOP_BUY,
    secureListener(
      ShopBuyPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_SHOP_BUY,
          enqueuedAt: Date.now(),
          execute: () =>
            ctx.session.getControl()?.shopBuy(payload.npcIndex, payload.slotIndex, payload.bagSlot)
              .cooldownMs ?? 0,
        });
      },
      IPC.SHOP_BUY,
    ),
  );

  on(
    IPC.RESPAWN,
    secureEmptyListener((event) => {
      const ctx = resolveCtx(event);
      const queue = ctx?.session.getActionQueue();
      if (!ctx || !queue) return;
      queue.enqueue({
        priority: EActionPriority.HIGH,
        cooldownKey: OPCODE_RESPAWN_EXECUTE,
        enqueuedAt: Date.now(),
        execute: () => {
          ctx.session.getControl()?.respawn();
          return 5000;
        },
      });
    }),
  );

  on(
    IPC.ATTACK,
    secureListener(
      AttackPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        const { session } = ctx;
        const queue = session.getActionQueue();
        const movementState = session.getMovementState();
        if (!queue || !movementState) return;
        const attackerPosition = movementState.getPredictedPosition(Date.now());
        queue.enqueue({
          priority: EActionPriority.HIGH,
          cooldownKey: OPCODE_SINGLE_ATTACK,
          enqueuedAt: Date.now(),
          execute: () => {
            const control = session.getControl();
            if (!control) return 0;
            // Header clientId must be mob slot index, same as movement packets
            control.singleAttack(
              control.mobIndex,
              attackerPosition,
              payload.targetPosition,
              payload.targetIndex,
              payload.skillId,
              {
                packetKind: payload.packetKind,
                extraTargetIndexes: payload.extraTargetIndexes,
              },
            );
            // game has no ATTACK→MOVE lockout (only a SKILL→ATTACK
            // gate at self+0xC60, not modeled here). The 1000ms ATTACK_QUEUE_COOLDOWN_MS
            // matches the canonical packet gate at g_game+0x2764E. See
            // `` §9.
            return ATTACK_QUEUE_COOLDOWN_MS;
          },
        });
      },
      IPC.ATTACK,
    ),
  );

  on(
    IPC.CAST_BUFF,
    secureListener(
      CastBuffPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        if (!ctx) return;
        const { session } = ctx;
        const queue = session.getActionQueue();
        const movementState = session.getMovementState();
        if (!queue || !movementState) return;
        const attackerPosition = movementState.getPredictedPosition(Date.now());
        queue.enqueue({
          // NORMAL: a self-buff must not preempt movement (0x36C is HIGH).
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_SINGLE_ATTACK,
          enqueuedAt: Date.now(),
          execute: () => {
            const control = session.getControl();
            if (!control) return 0;
            control.castBuff(
              control.mobIndex,
              attackerPosition,
              payload.skillId,
              payload.packetKind,
            );
            return ATTACK_QUEUE_COOLDOWN_MS;
          },
        });
      },
      IPC.CAST_BUFF,
    ),
  );

  on(
    IPC.SEND_MESSAGE,
    secureListener(
      ChatPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_CHAT_MESSAGE,
          enqueuedAt: Date.now(),
          execute: () => {
            const control = ctx.session.getControl();
            control?.sendMessage(control.clientId, payload.message);
            return 1000;
          },
        });
      },
      IPC.SEND_MESSAGE,
    ),
  );

  on(
    IPC.WHISPER_MESSAGE,
    secureListener(
      WhisperPayloadSchema,
      (event, payload) => {
        const ctx = resolveCtx(event);
        const queue = ctx?.session.getActionQueue();
        if (!ctx || !queue) return;
        queue.enqueue({
          priority: EActionPriority.NORMAL,
          cooldownKey: OPCODE_WHISPER_MESSAGE,
          enqueuedAt: Date.now(),
          execute: () => {
            ctx.session.getControl()?.sendCommand(0, payload.command, payload.message);
            return 1000;
          },
        });
      },
      IPC.WHISPER_MESSAGE,
    ),
  );

  ipcLogger.debug('Command handlers registered');
};
