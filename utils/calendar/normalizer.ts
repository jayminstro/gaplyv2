import { CalendarBusyBlock } from '../../types/calendar';
import { UserPreferences } from '../../types/index';
import { minutesToTime, timeToMinutes } from '../helpers';

export class CalendarNormalizer {
  static expandAllDay(
    event: CalendarBusyBlock,
    preferences: UserPreferences
  ): CalendarBusyBlock[] {
    console.log('🔧 expandAllDay called with:', { event, preferences: { 
      calendar_all_day_block_mode: preferences.calendar_all_day_block_mode,
      calendar_work_start: preferences.calendar_work_start,
      calendar_work_end: preferences.calendar_work_end
    }});
    
    if (!event.isAllDay) {
      console.log('🔧 Not all-day event, returning as-is');
      return [
        {
          date: event.date,
          start_time: event.start_time,
          end_time: event.end_time,
          source: event.source,
          calendarId: event.calendarId,
          title: event.title,
          isAllDay: false,
          uid: event.uid,
          recurrenceId: event.recurrenceId,
          transparency: event.transparency,
          status: event.status,
          location: event.location,
          notes: event.notes,
          url: event.url,
          lastSyncedAt: event.lastSyncedAt
        }
      ];
    }

    const mode = preferences.calendar_all_day_block_mode || 'workday';
    console.log('🔧 All-day event, mode:', mode);
    
    if (mode === 'ignore') {
      console.log('🔧 Ignoring all-day event');
      return [];
    }

    const workStart = preferences.calendar_work_start || '09:00';
    const workEnd = preferences.calendar_work_end || '18:00';

    if (mode === 'workday') {
      console.log('🔧 Creating workday block:', { workStart, workEnd });
      return [
        {
          date: event.date,
          start_time: workStart,
          end_time: workEnd,
          source: event.source,
          calendarId: event.calendarId,
          title: event.title,
          isAllDay: true,
          uid: event.uid,
          recurrenceId: event.recurrenceId,
          transparency: event.transparency,
          status: event.status,
          location: event.location,
          notes: event.notes,
          url: event.url,
          lastSyncedAt: event.lastSyncedAt
        }
      ];
    }

    // mode === 'window': create a fixed-size block centered within work window
    const blockMinutes = preferences.calendar_all_day_fixed_block_minutes || 30;
    const startMin = timeToMinutes(workStart);
    const endMin = timeToMinutes(workEnd);
    const windowMinutes = Math.max(0, endMin - startMin);
    const duration = Math.min(blockMinutes, windowMinutes);
    const position = preferences.calendar_all_day_fixed_block_start || 'start';
    let blockStartMin = startMin;
    if (position === 'middle') {
      blockStartMin = startMin + Math.floor((windowMinutes - duration) / 2);
    } else if (position === 'end') {
      blockStartMin = Math.max(startMin, endMin - duration);
    }
    const blockEndMin = blockStartMin + duration;

    console.log('🔧 Creating fixed window block:', { 
      blockMinutes, startMin, endMin, windowMinutes, duration, position, blockStartMin, blockEndMin 
    });

    return [
      {
        date: event.date,
        start_time: minutesToTime(blockStartMin),
        end_time: minutesToTime(blockEndMin),
        source: event.source,
        calendarId: event.calendarId,
        title: event.title,
        isAllDay: true,
        uid: event.uid,
        recurrenceId: event.recurrenceId,
        transparency: event.transparency,
        status: event.status,
        location: event.location,
        notes: event.notes,
        url: event.url,
        lastSyncedAt: event.lastSyncedAt
      }
    ];
  }

  static filterByTransparency(blocks: CalendarBusyBlock[], preferences: UserPreferences): CalendarBusyBlock[] {
    console.log('🔧 filterByTransparency called with:', { 
      blocksCount: blocks.length, 
      preferences: { 
        calendar_block_tentative: preferences.calendar_block_tentative 
      } 
    });
    
    const keepTentative = !!preferences.calendar_block_tentative;
    const filtered = blocks.filter(b => {
      if (b.status === 'cancelled') {
        console.log('🔧 Filtering out cancelled event:', b);
        return false;
      }
      if (b.transparency === 'free') {
        console.log('🔧 Filtering out free event:', b);
        return false;
      }
      if (b.transparency === 'tentative' && !keepTentative) {
        console.log('🔧 Filtering out tentative event (tentative not allowed):', b);
        return false;
      }
      console.log('🔧 Keeping event:', b);
      return true;
    });
    
    console.log('🔧 filterByTransparency result:', { 
      input: blocks.length, 
      output: filtered.length,
      filtered 
    });
    
    return filtered;
  }

  static mergeOverlaps(blocks: CalendarBusyBlock[]): CalendarBusyBlock[] {
    console.log('🔧 mergeOverlaps called with:', { blocksCount: blocks.length, blocks });
    
    if (blocks.length === 0) return blocks;
    
    const sorted = [...blocks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start_time.localeCompare(b.start_time);
    });
    
    console.log('🔧 Sorted blocks:', sorted);
    
    const merged: CalendarBusyBlock[] = [];
    for (const block of sorted) {
      const last = merged[merged.length - 1];
      if (!last || last.date !== block.date) {
        console.log('🔧 Adding new date block:', block);
        merged.push({ ...block });
        continue;
      }
      const lastEnd = timeToMinutes(last.end_time);
      const curStart = timeToMinutes(block.start_time);
      if (curStart > lastEnd) {
        console.log('🔧 Adding non-overlapping block:', block);
        merged.push({ ...block });
      } else {
        // overlap or touch: extend end
        const newEnd = Math.max(lastEnd, timeToMinutes(block.end_time));
        const oldEnd = last.end_time;
        last.end_time = minutesToTime(newEnd);
        console.log('🔧 Merged overlapping blocks:', { 
          old: { ...last, end_time: oldEnd }, 
          new: block, 
          merged: last 
        });
      }
    }
    
    console.log('🔧 mergeOverlaps result:', { 
      input: blocks.length, 
      output: merged.length,
      merged 
    });
    
    return merged;
  }
}


