import { promisify } from 'node:util';
// `zlib.crc32` requires Node ≥ 22.2 (Electron 40 ships Node 22+).
import { crc32, deflate as deflateCb } from 'node:zlib';

const deflate = promisify(deflateCb);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const buildChunk = (type: string, data: Buffer): Buffer => {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const checksumInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(checksumInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

const buildIhdr = (width: number, height: number): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
};

const applyNoneFilter = (rgba: Buffer, width: number, height: number): Buffer => {
  const stride = width * 4;
  const filtered = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dstOff = y * (stride + 1);
    filtered[dstOff] = 0;
    rgba.copy(filtered, dstOff + 1, y * stride, (y + 1) * stride);
  }
  return filtered;
};

export const encodeRgbaPng = async (
  rgba: Buffer,
  width: number,
  height: number,
): Promise<Buffer> => {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `RGBA buffer size mismatch: ${rgba.length} bytes (expected ${width * height * 4})`,
    );
  }

  const filtered = applyNoneFilter(rgba, width, height);
  const compressed = await deflate(filtered);

  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', buildIhdr(width, height)),
    buildChunk('IDAT', compressed),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
};
