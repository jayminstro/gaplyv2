import { CalendarBusyBlock } from '../../types/calendar';

type CacheEntry = { blocks: CalendarBusyBlock[]; updatedAt: string };

export class CalendarCache {
  private prefix: string;
  private ttlMs: number;

  constructor(prefix: string = 'gaply_calendar_busy_', ttlMinutes: number = 60) {
    this.prefix = prefix;
    this.ttlMs = Math.max(1, ttlMinutes) * 60 * 1000;
  }

  private key(date: string): string {
    return `${this.prefix}${date}`;
  }

  async getBusyBlocks(date: string): Promise<CalendarBusyBlock[] | null> {
    try {
      const raw = localStorage.getItem(this.key(date));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      if (!entry?.updatedAt || !Array.isArray(entry?.blocks)) return null;
      const age = Date.now() - new Date(entry.updatedAt).getTime();
      if (age > this.ttlMs) return null;
      return entry.blocks;
    } catch {
      return null;
    }
  }

  async setBusyBlocks(date: string, blocks: CalendarBusyBlock[]): Promise<void> {
    try {
      const entry: CacheEntry = { blocks, updatedAt: new Date().toISOString() };
      localStorage.setItem(this.key(date), JSON.stringify(entry));
    } catch {}
  }

  async invalidateDate(date: string): Promise<void> {
    try { localStorage.removeItem(this.key(date)); } catch {}
  }

  async cleanup(rollingWindow: { start: string; end: string }): Promise<void> {
    try {
      const start = rollingWindow.start;
      const end = rollingWindow.end;
      const prefixLen = this.prefix.length;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.prefix)) continue;
        const date = k.substring(prefixLen);
        if (date < start || date > end) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }
}


