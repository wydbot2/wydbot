/** Field*.dat — placed-object records for a map sector; no header, variable-stride. */

const BASE_STRIDE = 0x1c;
const WIDE_STRIDE = 0x24;
const MAX_RECORDS = 0x1000;

/** Light/effect type ranges carry two extra floats (36-byte record). */
const isWideType = (type: number): boolean =>
  (type >= 0x1f5 && type <= 0x1fa) ||
  (type >= 0x1ff && type <= 0x206) ||
  (type >= 0x208 && type <= 0x257);

export interface DatObject {
  type: number;
  /** Field-local tile floats (sector origin NOT added). */
  x: number;
  y: number;
  z: number;
  rot: number;
  /** `object.bin` model index. */
  modelId: number;
}

export const parseFieldDat = (buf: Buffer): DatObject[] => {
  const objects: DatObject[] = [];
  let off = 0;

  while (off < buf.length && objects.length < MAX_RECORDS) {
    if (off + BASE_STRIDE > buf.length) {
      throw new Error(`Field*.dat truncated record at offset ${off} (size ${buf.length})`);
    }
    const type = buf.readUInt32LE(off);
    objects.push({
      type,
      x: buf.readFloatLE(off + 4),
      y: buf.readFloatLE(off + 8),
      z: buf.readFloatLE(off + 0xc),
      rot: buf.readFloatLE(off + 0x10),
      modelId: buf.readUInt32LE(off + 0x18),
    });
    off += isWideType(type) ? WIDE_STRIDE : BASE_STRIDE;
  }

  if (off !== buf.length) {
    throw new Error(`Field*.dat parse desync: ended at ${off}, expected EOF ${buf.length}`);
  }

  return objects;
};
