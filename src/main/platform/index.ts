export {
  parseGuidToBytes,
  getMacBytes,
  getAdapterGuidBytes,
  fingerprintFromGuid,
  getStableFingerprint,
  getMachineBindingKey,
  deriveSessionHardwareIdentity,
  resolveLoginHardwareIdentity,
  getSessionMacPreview,
} from './hardware-identity';

export { startSleepPrevention, stopSleepPrevention } from './sleep-prevention';
