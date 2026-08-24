/**
 * Typed failure contract for game-asset parsers.
 *
 * A game patch can change a binary's record width, row count, or stride at any
 * time (the table grows by appending fields). Parsers must therefore NEVER
 * silently read at a wrong stride (wrong stats) and NEVER crash the process on
 * drift. They throw an `AssetFormatError` — a typed, serializable failure the
 * boot/IPC layer turns into an ON-SCREEN error instead of a silent fallback to
 * stale data. The throw is caught at every boundary (item-db handler, boot
 * validator, update gate).
 */

import type { AssetFailure, AssetFormatReason } from '@shared/types/asset-health-types';

export class AssetFormatError extends Error {
  constructor(
    public readonly asset: string,
    public readonly reason: AssetFormatReason,
    public readonly expected: string,
    public readonly actual: string,
    public readonly detail?: string,
  ) {
    super(
      `${asset}: ${reason} — expected ${expected}, got ${actual}` + (detail ? ` (${detail})` : ''),
    );
    this.name = 'AssetFormatError';
  }

  public toFailure(): AssetFailure {
    return {
      asset: this.asset,
      reason: this.reason,
      expected: this.expected,
      actual: this.actual,
      detail: this.detail,
    };
  }
}

/** Normalize any thrown value into an `AssetFailure` for the given asset. */
export const toAssetFailure = (asset: string, err: unknown): AssetFailure => {
  if (err instanceof AssetFormatError) return err.toFailure();
  return {
    asset,
    reason: 'decode-failed',
    expected: 'a parseable file',
    actual: err instanceof Error ? err.message : String(err),
  };
};

/** Failure for an asset whose file is absent/unreadable. */
export const missingAssetFailure = (asset: string): AssetFailure => ({
  asset,
  reason: 'decode-failed',
  expected: 'a readable file',
  actual: 'missing',
});

export interface DetectedLayout {
  /** Record width / stride in bytes. */
  readonly width: number;
  /** Number of records. */
  readonly count: number;
  /** Bytes of records (excludes trailer). */
  readonly payloadSize: number;
}

export interface DetectLayoutOpts {
  readonly asset: string;
  /** Allowlisted record widths/strides. A width is trusted only if it appears here. */
  readonly widths: readonly number[];
  /** Candidate trailer sizes (checked in order). Defaults to `[0]`. */
  readonly trailers?: readonly number[];
  /** Reject a derived count above this — the OOM guard against a hostile/corrupt file. */
  readonly maxCount: number;
  /** Reject a derived count below this — catches truncated/empty downloads. */
  readonly minCount: number;
  /**
   * Optional content check used ONLY to disambiguate when >1 width matches.
   * Return true if `(width,count)` yields structurally plausible records.
   * Not called when exactly one width matches, so sparse test fixtures pass.
   */
  readonly plausible?: (buf: Buffer, layout: DetectedLayout) => boolean;
}

/**
 * Derive `(width, count)` from a buffer length against an allowlist of widths.
 *
 * - Exactly one width divides (with an allowed trailer) and yields a count in
 *   `[minCount, maxCount]` ⇒ that layout.
 * - Zero matches ⇒ `unknown-layout` (or `truncated`/`empty`/`implausible-count`
 *   when a width divides but the count is out of range).
 * - More than one match ⇒ disambiguate via `plausible`; still >1 (or 0) ⇒
 *   `ambiguous-stride`.
 */
export const detectRecordLayout = (buf: Buffer, opts: DetectLayoutOpts): DetectedLayout => {
  const trailers = opts.trailers ?? [0];
  const matches: DetectedLayout[] = [];
  let sawOversizeCount = false;
  let sawUndersizeCount = false;

  for (const width of opts.widths) {
    for (const trailer of trailers) {
      const payloadSize = buf.length - trailer;
      if (payloadSize < 0 || payloadSize % width !== 0) continue;
      const count = payloadSize / width;
      if (count > opts.maxCount) {
        sawOversizeCount = true;
        continue;
      }
      if (count < opts.minCount) {
        sawUndersizeCount = true;
        continue;
      }
      matches.push({ width, count, payloadSize });
      break; // a given width matches at most one trailer
    }
  }

  const widthList = opts.widths.join('|');
  if (matches.length === 0) {
    if (sawOversizeCount) {
      throw new AssetFormatError(
        opts.asset,
        'implausible-count',
        `≤ ${opts.maxCount} records`,
        `${buf.length} bytes`,
        'derived row count exceeds the safety ceiling',
      );
    }
    if (sawUndersizeCount) {
      throw new AssetFormatError(
        opts.asset,
        buf.length === 0 ? 'empty' : 'truncated',
        `≥ ${opts.minCount} records of width {${widthList}}`,
        `${buf.length} bytes`,
      );
    }
    throw new AssetFormatError(
      opts.asset,
      'unknown-layout',
      `a multiple of {${widthList}} (+trailer {${trailers.join('|')}})`,
      `${buf.length} bytes`,
    );
  }

  if (matches.length === 1) return matches[0];

  // Ambiguous: more than one allowlisted width divides. Disambiguate by content.
  if (opts.plausible) {
    const plausible = matches.filter((m) => opts.plausible!(buf, m));
    if (plausible.length === 1) return plausible[0];
  }
  throw new AssetFormatError(
    opts.asset,
    'ambiguous-stride',
    'exactly one plausible width',
    `${buf.length} bytes divides by ${matches.map((m) => m.width).join(' and ')}`,
    'refusing to guess the stride',
  );
};
