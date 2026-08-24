/** object.bin — 4096 per-model 16×16 collision silhouette grids; additively obfuscated. */

const BODY_SIZE = 0x100000; // 1 MiB; on disk a u32 checksum follows
export const MODEL_COUNT = 0x1000;
export const MODEL_STRIDE = 0x100;

/** Additive de-obfuscation key. */
const KEY = [
  177, 221, 176, 173, 187, 234, 195, 163, 190, 198, 176, 161, 192, 218, 192, 207, 184, 184, 192,
  204, 195, 181, 186, 192, 186, 188, 188, 246, 183, 207, 190, 198, 184, 167, 180, 228, 176, 237,
  189, 197, 186, 241, 199, 207, 177, 184, 179, 170, 191, 236, 184, 174, 179, 170, 182, 243, 193,
  193, 192, 186, 179, 170, 182, 243, 187, 245, 179, 170, 182, 243, 192, 199, 190, 238, 184, 176,
  192, 204, 180, 194, 192, 207, 194, 239, 192, 207, 190, 238, 179, 179, 180, 207, 180, 217, 192,
  225, 178, 217, 183, 175, 177, 226, 190, 248, 180, 194, 179, 170, 182, 243, 191, 236, 184, 174,
  179, 170, 182, 243, 193, 193, 192, 186, 179, 170, 182, 243, 185, 171, 177, 195, 200, 173, 185,
  171, 177, 195, 200, 173, 191, 236, 184, 174, 179, 170, 182, 243, 178, 201, 187, 239, 195, 181,
  184, 174, 176, 173, 187, 234, 191, 161, 191, 236, 184, 174, 179, 170, 182, 243, 178, 201,
] as const;

export interface ParsedObjectBin {
  silhouettes: Uint8Array;
  modelCount: number;
}

export const parseObjectBin = (buf: Buffer): ParsedObjectBin => {
  if (buf.length < BODY_SIZE) {
    throw new Error(`object.bin truncated: expected ≥ ${BODY_SIZE} bytes, got ${buf.length}`);
  }

  const silhouettes = new Uint8Array(BODY_SIZE);
  for (let i = 0; i < BODY_SIZE; i++) {
    silhouettes[i] = (buf[i] - KEY[i % KEY.length] - (i & 0xff)) & 0xff;
  }

  return { silhouettes, modelCount: MODEL_COUNT };
};
