import { useAppConfigStore } from '../stores/app-config-store';
import { usePartyStore } from '../stores/party-store';
import { getOtherPlayers } from './entity-selectors';
import { gameApi } from './game-api';
import { getGroupMemberNames } from './group-membership';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

const POLL_MS = 1000;

/** Min ms between repeat invites to the same target (flood guard). */
const INVITE_COOLDOWN_MS = 10_000;

/** charIndex → last invite timestamp (per-target cooldown). */
const inviteCooldowns = new Map<number, number>();

registerAmbientModule({
  name: 'auto-group',
  pollIntervalMs: POLL_MS,
  lifecycle: 'always-on',

  tick: async (signal) => {
    if (signal.aborted) return;

    const cfg = useAppConfigStore.getState().config.misc?.autoGroup;
    if (!cfg?.enabled || cfg.whitelist.length === 0) return;

    const whitelist = new Set(cfg.whitelist.map((m) => m.name.toLowerCase()));

    if (cfg.mode === 'accept') {
      const invites = usePartyStore.getState().pendingInvites;
      if (invites.length === 0) return;
      const players = getOtherPlayers();
      for (const invite of invites) {
        // Prefer the inviter's live entity name over the invite packet name.
        const name =
          players.find((p) => p.index === invite.inviterIndex)?.name ?? invite.inviterName;
        if (!whitelist.has(name.toLowerCase())) continue;
        gameApi.partyAccept(invite.inviterIndex, name);
        usePartyStore.getState().removeInvite(invite.inviterIndex);
        logMacro('info', `[auto-grupo] convite de "${name}" aceito`);
      }
      return;
    }

    // mode === 'leader': invite whitelisted nearby players not yet in the party.
    const inGroup = getGroupMemberNames();
    const now = Date.now();
    for (const p of getOtherPlayers()) {
      const name = p.name.toLowerCase();
      if (!whitelist.has(name) || inGroup.has(name)) continue;
      if (now - (inviteCooldowns.get(p.index) ?? 0) < INVITE_COOLDOWN_MS) continue;
      inviteCooldowns.set(p.index, now);
      gameApi.partyInvite(p.index);
      logMacro('info', `[auto-grupo] convite enviado para "${p.name}" (idx=${p.index})`);
    }
  },

  reset: () => {
    inviteCooldowns.clear();
  },
});
