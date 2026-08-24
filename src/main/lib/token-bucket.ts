/**
 * Token-bucket rate limiter.
 *
 * Starts full at `capacity` tokens and refills at `refillRate` tokens/sec.
 * Call `tryConsume()` to attempt spending one token — returns `false` when
 * the bucket is empty, and `msUntilNextToken` tells you how long to wait.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity = 8,
    private readonly refillRate = 4,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Milliseconds until at least one token is available. */
  public get msUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    const deficit = 1 - this.tokens;
    return Math.ceil((deficit / this.refillRate) * 1000);
  }

  public tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
