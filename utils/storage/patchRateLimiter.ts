/**
 * Token-bucket rate limiter for preference PATCH calls.
 * - Refill: 1 token every 1500ms
 * - Capacity: 3 tokens (burst)
 */
class PatchRateLimiter {
  private capacity: number;
  private tokens: number;
  private refillIntervalMs: number;
  private lastRefill: number;

  constructor(capacity = 3, refillIntervalMs = 1500) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillIntervalMs = refillIntervalMs;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  consumeToken(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  // Test-only: reset the limiter to full capacity
  resetForTests(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

// Singleton per tab
const globalLimiter = new PatchRateLimiter();

export function consumePatchToken(): boolean {
  return globalLimiter.consumeToken();
}

// Test-only utility to reset the singleton limiter between tests
export function __resetPatchLimiterForTests() {
  globalLimiter.resetForTests();
}


