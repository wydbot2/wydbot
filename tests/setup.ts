import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installEmbeddedCryptoMaterial } from '../src/main/protocol/crypto-material-embedded';
import {
  EMBEDDED_PROTOCOL_COMPATIBILITY,
  setProtocolCompatibility,
} from '../src/main/protocol/protocol-compatibility';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => join(tmpdir(), 'wydbot-test'),
    isPackaged: false,
    getVersion: () => '0.0.0-test',
  },
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}));

// Protocol encrypt/decrypt + 0xBBF need KEY_TABLE / challenge LUTs in the process store.
installEmbeddedCryptoMaterial();
setProtocolCompatibility(EMBEDDED_PROTOCOL_COMPATIBILITY);
