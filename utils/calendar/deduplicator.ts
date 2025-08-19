import { CalendarBusyBlock } from '../../types/calendar';

export type DedupDecision = { keptUid?: string; dropped: string[]; reason: string };

export class CalendarDeduplicator {
  deduplicateEvents(blocks: CalendarBusyBlock[], strategy: 'auto'|'prefer_google'|'prefer_device'|'none' = 'auto'): { kept: CalendarBusyBlock[]; dropped: DedupDecision[] } {
    if (strategy === 'none') return { kept: blocks, dropped: [] };
    const byKey = new Map<string, CalendarBusyBlock[]>();
    for (const b of blocks) {
      const key = `${b.date}_${b.start_time}_${b.end_time}`;
      const list = byKey.get(key) || [];
      list.push(b);
      byKey.set(key, list);
    }
    const kept: CalendarBusyBlock[] = [];
    const dropped: DedupDecision[] = [];
    for (const [key, group] of byKey.entries()) {
      if (group.length === 1) { kept.push(group[0]); continue; }
      let chosen: CalendarBusyBlock | null = null;
      if (strategy === 'prefer_google') chosen = group.find(g => g.source === 'google') || group[0];
      else if (strategy === 'prefer_device') chosen = group.find(g => g.source === 'device') || group[0];
      else {
        // auto: prefer non-tentative, non-free
        chosen = group.find(g => g.transparency !== 'free' && g.status !== 'tentative') || group[0];
      }
      kept.push(chosen);
      const droppedUids = group.filter(g => g !== chosen).map(g => g.uid || `${key}_${g.source}`);
      if (droppedUids.length) dropped.push({ keptUid: chosen.uid, dropped: droppedUids, reason: strategy });
    }
    return { kept, dropped };
  }
}


