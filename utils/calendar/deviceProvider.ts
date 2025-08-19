import { CalendarBusyBlock, DateRange } from '../../types/calendar';
import { UserPreferences } from '../../types/index';
import { CalendarBridge, NativeEvent } from '../../src/plugins/calendar-bridge';
import { format } from 'date-fns';
import { CalendarNormalizer } from './normalizer';

export class DeviceCalendarProvider {
  async requestPermission(): Promise<boolean> {
    try {
      const res = await CalendarBridge.requestPermission();
      return res.status === 'granted';
    } catch {
      return false;
    }
  }

  async getCalendars(): Promise<string[]> {
    try {
      const res = await CalendarBridge.getCalendars();
      return (res.calendars || []).map(c => c.id);
    } catch {
      return [];
    }
  }

  async getBusyBlocks(dateRange: DateRange, preferences: UserPreferences): Promise<CalendarBusyBlock[]> {
    console.log('🔧 DeviceCalendarProvider.getBusyBlocks called with:', { dateRange, showBusy: preferences.show_device_calendar_busy });
    
    // For debugging, allow fetching even if preference is disabled
    const shouldFetch = preferences.show_device_calendar_busy || preferences.debugCalendarSync;
    if (!shouldFetch) {
      console.log('🔧 Calendar busy disabled and debug not enabled, returning empty array');
      return [];
    }
    
    const hasPerm = await this.requestPermission();
    if (!hasPerm) {
      console.log('🔧 No calendar permission, returning empty array');
      return [];
    }
    
    const included = (preferences.device_calendar_included_ids || []);
    const calendarIds = included.length > 0 ? included : await this.getCalendars();
    if (calendarIds.length === 0) {
      console.log('🔧 No calendars available, returning empty array');
      return [];
    }
    
    // Convert date strings to ISO datetime format that iOS expects
    const startISO = this.convertDateToISO(dateRange.start);
    const endISO = this.convertDateToISO(dateRange.end);
    
    console.log('🔧 Converted dates for iOS:', { 
      original: { start: dateRange.start, end: dateRange.end },
      converted: { start: startISO, end: endISO }
    });
    
    console.log('🔧 Fetching events for calendars:', calendarIds);
    try {
      const res = await CalendarBridge.getEvents({ start: startISO, end: endISO, calendarIds });
      console.log('🔧 CalendarBridge.getEvents returned:', res);
      
      const events = (res.events || []) as NativeEvent[];
      console.log('🔧 Raw events from bridge:', events);
      
      const blocks = events.flatMap(ev => this.normalizeEvent(ev, preferences));
      console.log('🔧 Normalized blocks:', blocks);
      
      const filtered = CalendarNormalizer.filterByTransparency(blocks, preferences);
      console.log('🔧 After transparency filtering:', filtered);
      
      const merged = CalendarNormalizer.mergeOverlaps(filtered);
      console.log('🔧 After merging overlaps:', merged);
      
      return merged;
    } catch (error) {
      console.error('🔧 Error fetching calendar events:', error);
      return [];
    }
  }

  private normalizeEvent(nativeEvent: NativeEvent, preferences: UserPreferences): CalendarBusyBlock[] {
    console.log('🔧 normalizeEvent called with:', { nativeEvent, preferences: { 
      show_device_calendar_titles: preferences.show_device_calendar_titles,
      calendar_all_day_block_mode: preferences.calendar_all_day_block_mode
    }});
    
    // Convert ms to local date/time strings (respect device/prefs TZ implicitly via format)
    const startDate = new Date(nativeEvent.start);
    const endDate = new Date(nativeEvent.end);
    const date = format(startDate, 'yyyy-MM-dd');
    const start_time = format(startDate, 'HH:mm');
    const end_time = format(endDate, 'HH:mm');
    
    console.log('🔧 Date conversion:', {
      original: { start: nativeEvent.start, end: nativeEvent.end },
      converted: { date, start_time, end_time },
      isAllDay: nativeEvent.isAllDay
    });
    
    const title = preferences.show_device_calendar_titles ? nativeEvent.title : undefined;
    const block: CalendarBusyBlock = {
      date,
      start_time,
      end_time,
      source: 'device',
      calendarId: nativeEvent.calendarId,
      title,
      isAllDay: nativeEvent.isAllDay,
      transparency: nativeEvent.transparency,
      status: nativeEvent.status,
      lastSyncedAt: new Date().toISOString()
    };
    
    console.log('🔧 Created block:', block);
    
    const expanded = CalendarNormalizer.expandAllDay(block, preferences);
    console.log('🔧 After expandAllDay:', expanded);
    
    return expanded;
  }

  private convertDateToISO(dateStr: string): string {
    // If it's already an ISO string, return as-is
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      return dateStr;
    }
    
    // If it's a date-only string (YYYY-MM-DD), convert to ISO datetime
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Create a Date object for the start of the day in local timezone
      const date = new Date(dateStr + 'T00:00:00');
      return date.toISOString();
    }
    
    // If it's any other format, try to parse it
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('🔧 Invalid date format:', dateStr, 'using current date');
      return new Date().toISOString();
    }
    
    return date.toISOString();
  }
}

