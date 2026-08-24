/**
 * Process-wide in-memory holder for WYD packet crypto material.
 * Installed at bootstrap from crypto-material-embedded.
 *
 * Never persisted to disk.
 */

export interface InstalledCryptoMaterial {
  version: number;
  keyTable: Uint8Array;
  spiralTable: readonly number[];
  expTableNormal: readonly number[];
  expTableCelestial: readonly number[];
  /** Wall-clock expiry of the server lease (hint); Infinity for embedded. */
  expiresAtMs: number;
}

let installed: InstalledCryptoMaterial | null = null;

export const setCryptoMaterial = (material: InstalledCryptoMaterial): void => {
  if (material.keyTable.length !== 512) {
    throw new Error(`KEY_TABLE must be 512 bytes, got ${material.keyTable.length}`);
  }
  if (material.spiralTable.length !== 20) {
    throw new Error(`spiral_table must have 20 entries, got ${material.spiralTable.length}`);
  }
  if (material.expTableNormal.length !== 400) {
    throw new Error(
      `exp_table_normal must have 400 entries, got ${material.expTableNormal.length}`,
    );
  }
  if (material.expTableCelestial.length !== 400) {
    throw new Error(
      `exp_table_celestial must have 400 entries, got ${material.expTableCelestial.length}`,
    );
  }
  installed = material;
};

export const clearCryptoMaterial = (): void => {
  installed = null;
};

export const hasCryptoMaterial = (): boolean => installed !== null;

export const getCryptoMaterial = (): InstalledCryptoMaterial | null => installed;

/** True when material exists and is not past expiresAt (with optional skew). */
export const isCryptoMaterialFresh = (skewMs = 30_000): boolean => {
  if (!installed) return false;
  if (!Number.isFinite(installed.expiresAtMs)) return true;
  return installed.expiresAtMs - Date.now() > skewMs;
};

export const getKeyTable = (): Uint8Array => {
  if (!installed) {
    throw new Error('Crypto material not loaded (KEY_TABLE)');
  }
  return installed.keyTable;
};

export const getSpiralTable = (): readonly number[] => {
  if (!installed) {
    throw new Error('Crypto material not loaded (SPIRAL_TABLE)');
  }
  return installed.spiralTable;
};

export const getExpTableNormal = (): readonly number[] => {
  if (!installed) {
    throw new Error('Crypto material not loaded (EXP_TABLE_NORMAL)');
  }
  return installed.expTableNormal;
};

export const getExpTableCelestial = (): readonly number[] => {
  if (!installed) {
    throw new Error('Crypto material not loaded (EXP_TABLE_CELESTIAL)');
  }
  return installed.expTableCelestial;
};
