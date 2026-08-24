export interface WytAtlas {
  width: number;
  height: number;
  /**
   * Pixel payload, ALWAYS 4 bytes per pixel in TGA channel order (B,G,R,A).
   * 24-bpp sources are expanded at decode time with alpha=255; 32-bpp sources
   * (e.g. m0724.wyt) pass through with the file's own alpha. Consumers apply
   * the project-wide chroma-key rule (pure black → alpha 0) on top of this.
   */
  pixels: Buffer;
  /**
   * TGA descriptor bit 5 (byte 21): set = rows stored TOP-DOWN, clear = bottom-up.
   * The item-icon family MIXES orientations per page — measured: 01..19 are
   * 0x00; 91 is RLE + 0x20; the bundled 92 is 0x02 + 0x00 while the CDN's
   * current RLE 92 (v718+) is 0x0A + 0x20. Extractors MUST honor this per atlas.
   */
  topDown: boolean;
}

const MAGIC_WT10 = 0x30315457;
// 4 magic bytes + 18-byte standard TGA header. Pixel data starts here for both type-0x02 and type-0x0A.
const HEADER_BASE = 22;
const TGA_TYPE_RGB_UNCOMPRESSED = 0x02;
const TGA_TYPE_RGB_RLE = 0x0a;

export const decodeWyt = (buf: Buffer): WytAtlas => {
  if (buf.length < HEADER_BASE) {
    throw new Error(`wyt too small: ${buf.length} bytes`);
  }

  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC_WT10) {
    const seen = buf.subarray(0, 4).toString('ascii');
    throw new Error(`Bad wyt magic: "${seen}" (expected "WT10")`);
  }

  const idLength = buf.readUInt8(4);
  const colorMapType = buf.readUInt8(5);
  const imageType = buf.readUInt8(6);

  if (idLength !== 0 || colorMapType !== 0) {
    throw new Error(`Unsupported wyt header: idLength=${idLength}, colorMapType=${colorMapType}`);
  }

  const width = buf.readUInt16LE(16);
  const height = buf.readUInt16LE(18);
  const bpp = buf.readUInt8(20);
  const topDown = (buf.readUInt8(21) & 0x20) !== 0;

  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`Unsupported wyt bpp: ${bpp} (expected 24 or 32)`);
  }
  if (imageType === TGA_TYPE_RGB_RLE && bpp !== 24) {
    throw new Error(`Unsupported wyt RLE bpp: ${bpp} (RLE only known at 24)`);
  }

  const srcStride = bpp / 8;
  const expectedSrcBytes = width * height * srcStride;

  let pixels: Buffer;
  if (imageType === TGA_TYPE_RGB_UNCOMPRESSED) {
    if (buf.length < HEADER_BASE + expectedSrcBytes) {
      throw new Error(
        `wyt truncated: ${buf.length} bytes ` +
          `(need at least ${HEADER_BASE + expectedSrcBytes} for ${width}×${height}×${bpp}bpp type-0x02)`,
      );
    }
    const src = buf.subarray(HEADER_BASE, HEADER_BASE + expectedSrcBytes);
    pixels = srcStride === 4 ? Buffer.from(src) : expandBgrToBgra(src, width * height);
  } else if (imageType === TGA_TYPE_RGB_RLE) {
    pixels = rleDecodeBgrToBgra(buf.subarray(HEADER_BASE), width * height);
  } else {
    throw new Error(`Unsupported wyt image type: 0x${imageType.toString(16).padStart(2, '0')}`);
  }

  return { width, height, pixels, topDown };
};

const expandBgrToBgra = (src: Buffer, pixelCount: number): Buffer => {
  const out = Buffer.allocUnsafe(pixelCount * 4);
  for (let s = 0, o = 0; o < out.length; s += 3, o += 4) {
    out[o] = src[s];
    out[o + 1] = src[s + 1];
    out[o + 2] = src[s + 2];
    out[o + 3] = 255;
  }
  return out;
};

const rleDecodeBgrToBgra = (data: Buffer, pixelCount: number): Buffer => {
  const out = Buffer.allocUnsafe(pixelCount * 4);
  let outPx = 0;
  let inPos = 0;

  while (outPx < pixelCount) {
    if (inPos >= data.length) {
      throw new Error(`wyt RLE truncated: produced ${outPx}/${pixelCount} pixels`);
    }
    const header = data[inPos++];
    if ((header & 0x80) !== 0) {
      const count = (header & 0x7f) + 1;
      if (inPos + 3 > data.length) {
        throw new Error(`wyt RLE truncated mid-packet at outPx=${outPx}`);
      }
      const c0 = data[inPos++];
      const c1 = data[inPos++];
      const c2 = data[inPos++];
      const limit = Math.min(count, pixelCount - outPx);
      for (let i = 0; i < limit; i++) {
        const o = outPx++ * 4;
        out[o] = c0;
        out[o + 1] = c1;
        out[o + 2] = c2;
        out[o + 3] = 255;
      }
    } else {
      const count = header + 1;
      const byteCount = count * 3;
      if (inPos + byteCount > data.length) {
        throw new Error(`wyt RLE truncated mid-raw at outPx=${outPx}`);
      }
      const copyPixels = Math.min(count, pixelCount - outPx);
      for (let i = 0; i < copyPixels; i++) {
        const s = inPos + i * 3;
        const o = outPx++ * 4;
        out[o] = data[s];
        out[o + 1] = data[s + 1];
        out[o + 2] = data[s + 2];
        out[o + 3] = 255;
      }
      inPos += byteCount;
    }
  }

  return out;
};
