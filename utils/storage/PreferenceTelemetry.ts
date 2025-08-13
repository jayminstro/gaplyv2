/**
 * Privacy-safe telemetry for preference autosave operations.
 * Tracks only counts and timings; never logs field names or values.
 */
class PreferenceTelemetry {
  private static instance: PreferenceTelemetry;

  private counters: Record<string, number> = {
    autosave_attempts: 0,
    autosave_success: 0,
    autosave_failures: 0,
    conflicts_409: 0,
    prevented_writes: 0,
    offline_saves: 0,
    rate_limited_skips: 0,
    pending_sync_flushes: 0,
  };

  static getInstance(): PreferenceTelemetry {
    if (!PreferenceTelemetry.instance) {
      PreferenceTelemetry.instance = new PreferenceTelemetry();
    }
    return PreferenceTelemetry.instance;
  }

  increment(name: keyof PreferenceTelemetry['counters']): void {
    this.counters[name] = (this.counters[name] || 0) + 1;
  }

  getReport(): Record<string, number> {
    return { ...this.counters };
  }
}

export function telemetryIncrement(name: keyof PreferenceTelemetry['counters']): void {
  PreferenceTelemetry.getInstance().increment(name);
}

export function telemetryReport(): Record<string, number> {
  return PreferenceTelemetry.getInstance().getReport();
}


