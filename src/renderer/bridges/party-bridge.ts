import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { usePartyStore } from '../stores/party-store';
import { logger } from '../lib/logger';

/** Routes S2C party events (roster + invites) into the party store. */
export const setupPartyBridge = (api: WydBotAPI): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    api.onPartyRosterUpdate((data) => {
      usePartyStore.getState().upsertMember(data);
    }),
  );

  unsubs.push(
    api.onPartyLeft((data) => {
      usePartyStore.getState().removeMember(data.charIndex);
    }),
  );

  unsubs.push(
    api.onPartyInviteReceived((data) => {
      logger.log(`[BRIDGE] party invite from ${data.inviterName} (idx=${data.inviterIndex})`);
      usePartyStore.getState().addInvite({
        inviterIndex: data.inviterIndex,
        inviterName: data.inviterName,
        receivedAtMs: Date.now(),
      });
    }),
  );

  // Clear party on the entity bulk-wipe (CharToWorld / logout / scene teardown).
  unsubs.push(
    api.onEntitiesReset(() => {
      usePartyStore.getState().clear();
    }),
  );

  return unsubs;
};
