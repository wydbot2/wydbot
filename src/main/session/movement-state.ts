/** Single source of truth for player position (main); ActionQueue owns throttling. */
import { interpolateLeg, moveStepCount, perTileMs } from '@shared/lib/movement-math';
import type { DirectionCode, StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

interface PredictedLeg {
  src: MPosition;
  dst: MPosition;
  steps: number;
  perTileMs: number;
  startMs: number;
  codes?: readonly DirectionCode[];
}

/** A planned route the mover slices per chunk; the epoch invalidates it on a server correction. */
interface StoredRoute extends StreamRoute {
  epoch: number;
}

export class MovementState {
  /** Last server-anchored tile (charToWorld / inbound 0x36C correction). */
  private _confirmedTile: MPosition = { x: 0, y: 0 };
  /** The in-flight leg, dead-reckoned for the position broadcast. null when idle. */
  private _predicted: PredictedLeg | null = null;
  /** Active planned routes by move source — the mover slices each chunk from these. */
  private _routes = new Map<string, StoredRoute>();
  private _epoch = 0;

  /** Monotonic correction counter; a queued MOVE at a stale epoch is dropped at dequeue. */
  public get epoch(): number {
    return this._epoch;
  }

  /** Dead-reckoned current tile: the in-flight leg interpolated to `now`, else the confirmed tile. */
  public getPredictedPosition(now: number): MPosition {
    const p = this._predicted;
    if (!p) return this._confirmedTile;
    return interpolateLeg(p.src, p.dst, p.steps, p.perTileMs, now - p.startMs, p.codes);
  }

  /** True while the current leg's travel time has not yet elapsed. */
  public isInterpolating(now: number): boolean {
    const p = this._predicted;
    return p !== null && now - p.startMs < p.steps * p.perTileMs;
  }

  /** True iff a freshly-sliced chunk equals the leg still in-flight — re-sending it would just
   *  re-anchor the observer to the same origin (a backward snap), so the mover skips it. */
  public isLegInFlight(src: MPosition, codes: readonly DirectionCode[], now: number): boolean {
    const p = this._predicted;
    if (!p || !p.codes || now - p.startMs >= p.steps * p.perTileMs) return false;
    if (p.src.x !== src.x || p.src.y !== src.y || p.codes.length !== codes.length) return false;
    for (let i = 0; i < codes.length; i++) if (p.codes[i] !== codes[i]) return false;
    return true;
  }

  public commitMove(
    dst: MPosition,
    steps: number,
    speed: number,
    codes?: readonly DirectionCode[],
    src?: MPosition,
  ): void {
    const now = Date.now();
    this._predicted = {
      // Default: where we predict we are. Override (`src`): the exact wire src the
      // caller just sent, so the dead-reckoned leg and the 0x36C share one origin.
      src: src ?? this.getPredictedPosition(now),
      dst,
      steps,
      perTileMs: perTileMs(speed),
      startMs: now,
      codes,
    };
  }

  /** Store the planned route for a move source, stamped with the current epoch. */
  public setRoute(
    source: string,
    tiles: readonly MPosition[],
    codes: readonly DirectionCode[],
    waypoints?: readonly number[],
  ): void {
    this._routes.set(source, { tiles, codes, waypoints, epoch: this._epoch });
  }

  /** Active route for a source, or null if none / stamped before the latest correction. */
  public getRoute(source: string): StreamRoute | null {
    const r = this._routes.get(source);
    if (!r || r.epoch !== this._epoch) return null;
    return r;
  }

  public setCharToWorld(pos: MPosition): void {
    this.anchorTo(pos);
  }

  /** Server-forced reposition (rubberband or teleport); bumps the epoch to drop stale queued MOVEs. */
  public applyRubberband(pos: MPosition): void {
    this.anchorTo(pos);
  }

  /**
   * src matched our predicted position, so adopt the server's leg (src → dst over
   * its direction codes) as the in-flight leg. Epoch still bumps — chunks queued
   * from the pre-correction route are stale.
   */
  public applyServerSteering(
    src: MPosition,
    dst: MPosition,
    codes: readonly DirectionCode[],
    speed: number,
  ): void {
    this._confirmedTile = src;
    this._predicted = {
      src,
      dst,
      steps: moveStepCount(src, dst, codes),
      perTileMs: perTileMs(speed),
      startMs: Date.now(),
      codes,
    };
    this._routes.clear();
    this._epoch++;
  }

  public reset(): void {
    this._confirmedTile = { x: 0, y: 0 };
    this._predicted = null;
    this._routes.clear();
    this._epoch = 0;
  }

  /** Hard-anchor to a server-confirmed tile: stop interpolation, drop stored routes, bump epoch. */
  private anchorTo(pos: MPosition): void {
    this._confirmedTile = pos;
    this._predicted = null;
    this._routes.clear();
    this._epoch++;
  }
}
