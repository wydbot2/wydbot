import type { ProtocolCompatibility } from '@shared/protocol/protocol-compatibility';
import { ProtocolCompatibilitySchema } from '@shared/protocol/protocol-compatibility';
import { ACCOUNT_CLIENT_VERSION, CLINE_VERSION_BASE } from '@shared/constants/network-basics';
import type { ClientBinaryObservation } from './client-binary-analyzer';

export const EMBEDDED_KEY_TABLE_SHA256 =
  'e47996fe5e92de5d86d503d5415665f1f464bf344370c709be450607dd97cf8f';
export const EMBEDDED_VERSION_DLL_SHA256 =
  'b57415fc64080d4d33de57e8cdc6807db8cf5a2bbe1668f2d77ebb8edbd9185c';
export const EMBEDDED_WYD_EXE_SHA256 =
  'a058262d36631fd8b674603fb20d54ff18016b8f3dd38249250e953b8efc3c50';

/** Trusted profile shipped with the app for the currently audited official patch. */
export const EMBEDDED_PROTOCOL_COMPATIBILITY: ProtocolCompatibility = {
  schemaVersion: 1,
  assetVersion: 727,
  protocolVersion: 727,
  accountClientVersion: ACCOUNT_CLIENT_VERSION,
  clineVersionBase: CLINE_VERSION_BASE,
  keyTableVersion: 1,
  keyTableSha256: EMBEDDED_KEY_TABLE_SHA256,
  versionDllSha256: EMBEDDED_VERSION_DLL_SHA256,
  wydExeSha256: EMBEDDED_WYD_EXE_SHA256,
};

export interface VersionedClientBinaryObservation extends ClientBinaryObservation {
  readonly patchVersion: number;
}

export interface ResolveProtocolCompatibilityInput {
  readonly assetVersion: number;
  readonly previous?: ProtocolCompatibility | null;
  readonly observations: readonly VersionedClientBinaryObservation[];
}

export class ProtocolCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolCompatibilityError';
  }
}

const initialCompatibility = (
  assetVersion: number,
  previous?: ProtocolCompatibility | null,
  observedEmbeddedBinaries = false,
): ProtocolCompatibility => {
  if (previous) {
    const parsed = ProtocolCompatibilitySchema.safeParse(previous);
    if (!parsed.success) {
      throw new ProtocolCompatibilityError('stored protocol compatibility is invalid');
    }
    if (parsed.data.assetVersion > assetVersion) {
      throw new ProtocolCompatibilityError('stored protocol compatibility is newer than assets');
    }
    if (
      parsed.data.keyTableVersion !== EMBEDDED_PROTOCOL_COMPATIBILITY.keyTableVersion ||
      parsed.data.keyTableSha256 !== EMBEDDED_KEY_TABLE_SHA256 ||
      parsed.data.clineVersionBase !== CLINE_VERSION_BASE
    ) {
      throw new ProtocolCompatibilityError(
        'stored protocol material is not supported by this build',
      );
    }
    return { ...parsed.data, assetVersion };
  }

  if (
    assetVersion < EMBEDDED_PROTOCOL_COMPATIBILITY.assetVersion ||
    (assetVersion !== EMBEDDED_PROTOCOL_COMPATIBILITY.assetVersion && !observedEmbeddedBinaries)
  ) {
    throw new ProtocolCompatibilityError(
      `asset v${assetVersion} has no stored or embedded protocol profile`,
    );
  }
  return { ...EMBEDDED_PROTOCOL_COMPATIBILITY, assetVersion };
};

/**
 * Carry a validated profile through data-only patches and apply constrained
 * observations from client-binary entries. Unknown WYD.exe builds are blocked:
 * finding the old Key Table is not enough to prove CLINE/layout compatibility.
 */
export const resolveProtocolCompatibility = ({
  assetVersion,
  previous,
  observations,
}: ResolveProtocolCompatibilityInput): ProtocolCompatibility => {
  const latestByKind = new Map<
    VersionedClientBinaryObservation['kind'],
    VersionedClientBinaryObservation
  >();
  for (const observation of observations) latestByKind.set(observation.kind, observation);
  const observedWyd = latestByKind.get('wyd-exe');
  const observedVersionDll = latestByKind.get('version-dll');
  const observedEmbeddedBinaries =
    observedWyd?.sha256 === EMBEDDED_WYD_EXE_SHA256 &&
    observedWyd.knownKeyTableMatches === 1 &&
    observedVersionDll?.sha256 === EMBEDDED_VERSION_DLL_SHA256 &&
    observedVersionDll.accountClientVersion ===
      EMBEDDED_PROTOCOL_COMPATIBILITY.accountClientVersion;
  let next = initialCompatibility(assetVersion, previous, observedEmbeddedBinaries);

  for (const observation of latestByKind.values()) {
    if (observation.patchVersion > assetVersion) {
      throw new ProtocolCompatibilityError('client binary observation is newer than assets');
    }

    if (observation.kind === 'wyd-exe') {
      if (
        observation.sha256 !== EMBEDDED_WYD_EXE_SHA256 ||
        observation.knownKeyTableMatches !== 1
      ) {
        throw new ProtocolCompatibilityError(
          `WYD.exe changed at patch ${observation.patchVersion}; Key Table/CLINE require review`,
        );
      }
      next = {
        ...next,
        wydExeSha256: observation.sha256,
      };
      continue;
    }

    if (
      observation.sha256 !== EMBEDDED_VERSION_DLL_SHA256 ||
      observation.accountClientVersion !== EMBEDDED_PROTOCOL_COMPATIBILITY.accountClientVersion
    ) {
      throw new ProtocolCompatibilityError(
        `version.dll changed at patch ${observation.patchVersion}; signed protocol approval required`,
      );
    }
    next = {
      ...next,
      accountClientVersion: observation.accountClientVersion,
      versionDllSha256: observation.sha256,
    };
  }

  return ProtocolCompatibilitySchema.parse(next);
};

type ProtocolCompatibilityStatus = 'unchecked' | 'checking' | 'ready' | 'blocked';

let status: ProtocolCompatibilityStatus = 'unchecked';
let installed: ProtocolCompatibility | null = null;

/** Invalidate the prior lease before every asset/protocol gate attempt. */
export const beginProtocolCompatibilityCheck = (): void => {
  installed = null;
  status = 'checking';
};

/** Keep network login fail-closed after a failed gate. */
export const blockProtocolCompatibility = (): void => {
  installed = null;
  status = 'blocked';
};

export const setProtocolCompatibility = (value: ProtocolCompatibility): void => {
  installed = ProtocolCompatibilitySchema.parse(value);
  status = 'ready';
};

export const getAccountClientVersion = (): number => {
  if (!installed || status !== 'ready') {
    throw new ProtocolCompatibilityError(`protocol compatibility is ${status}`);
  }
  return installed.accountClientVersion;
};
