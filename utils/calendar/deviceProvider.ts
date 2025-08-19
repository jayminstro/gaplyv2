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
    const startRange = this.convertDateRangeToISO(dateRange.start);
    const endRange = this.convertDateRangeToISO(dateRange.end);
    
    // Use the start of the first day and end of the last day
    const startISO = startRange.start;
    const endISO = endRange.end;
    
    console.log('🔧 Converted dates for iOS:', { 
      original: { start: dateRange.start, end: dateRange.end },
      startRange,
      endRange,
      final: { start: startISO, end: endISO }
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
      // Use the local timezone offset to ensure we get the right day
      const date = new Date(dateStr + 'T00:00:00');
      
      // Get the timezone offset in minutes
      const tzOffset = date.getTimezoneOffset();
      
      // Adjust the date to account for timezone offset
      // This ensures we're asking for the correct day in the user's timezone
      const adjustedDate = new Date(date.getTime() - (tzOffset * 60 * 1000));
      
      console.log('🔧 Date conversion details:', {
        original: dateStr,
        localDate: date.toISOString(),
        tzOffset,
        adjustedDate: adjustedDate.toISOString()
      });
      
      return adjustedDate.toISOString();
    }

    // If it's any other format, try to parse it
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('🔧 Invalid date format:', dateStr, 'using current date');
      return new Date().toISOString();
    }

    return date.toISOString();
  }

  private convertDateRangeToISO(dateStr: string): { start: string; end: string } {
    // If it's already an ISO string, return as-is
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      return { start: dateStr, end: dateStr };
    }

    // If it's a date-only string (YYYY-MM-DD), convert to start and end of day
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Create Date objects for start and end of day in local timezone
      const startDate = new Date(dateStr + 'T00:00:00');
      const endDate = new Date(dateStr + 'T23:59:59.999');
      
      // Instead of adjusting for timezone offset, we want to ensure the full day is covered
      // The key insight: when we create a Date with "2025-08-12T00:00:00", JavaScript interprets
      // this as local time, but when we call toISOString(), it converts to UTC.
      // We want the UTC time to represent the start of the day in the user's timezone.
      
      // Get the timezone offset in minutes
      const tzOffset = startDate.getTimezoneOffset();
      
      // To get the correct UTC time that represents the start of the day in local timezone,
      // we need to add the timezone offset (since getTimezoneOffset() returns the difference
      // from UTC, and we want to shift the UTC time to match the local time)
      const adjustedStart = new Date(startDate.getTime() + (tzOffset * 60 * 1000));
      const adjustedEnd = new Date(endDate.getTime() + (tzOffset * 60 * 1000));
      
      console.log('🔧 Date range conversion details:', {
        original: dateStr,
        startLocal: startDate.toISOString(),
        endLocal: endDate.toISOString(),
        tzOffset,
        adjustedStart: adjustedStart.toISOString(),
        adjustedEnd: adjustedEnd.toISOString()
      });
      
      return {
        start: adjustedStart.toISOString(),
        end: adjustedEnd.toISOString()
      };
    }

    // If it's any other format, try to parse it
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('🔧 Invalid date format:', dateStr, 'using current date');
      const now = new Date();
      return { start: now.toISOString(), end: now.toISOString() };
    }

    return { start: date.toISOString(), end: date.toISOString() };
  }
}

