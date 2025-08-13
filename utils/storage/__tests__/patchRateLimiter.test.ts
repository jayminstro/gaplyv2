import { describe, it, expect, beforeEach } from 'vitest';
import { consumePatchToken, __resetPatchLimiterForTests } from '../patchRateLimiter';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

describe('patchRateLimiter', () => {
  beforeEach(() => {
    __resetPatchLimiterForTests();
  });
  it('allows burst up to 3 then blocks', async () => {
    // Limiter reset ensures full tokens
    await sleep(10);
    const a = consumePatchToken();
    const b = consumePatchToken();
    const c = consumePatchToken();
    const d = consumePatchToken();
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
    expect(d).toBe(false);
  });

  it('refills after window', async () => {
    // Limiter reset ensures full tokens
    await sleep(10);
    // Drain all tokens
    expect(consumePatchToken()).toBe(true);
    expect(consumePatchToken()).toBe(true);
    expect(consumePatchToken()).toBe(true);
    // Now blocked
    expect(consumePatchToken()).toBe(false);
    // Wait ~1.6s to refill at least one token
    await sleep(1700);
    const allowed = consumePatchToken();
    expect(allowed).toBe(true);
  }, 8000);
});


