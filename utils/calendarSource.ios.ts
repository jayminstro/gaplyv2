import { CalendarBridge, BridgeCalendar, BridgeEvent } from '../native/CalendarBridge';
import { BusyBlock } from '../types';

/**
 * Get device calendars from EventKit
 */
export async function getDeviceCalendars(): Promise<BridgeCalendar[]> {
  try {
    const result = await CalendarBridge.listCalendars();
    return result.calendars;
  } catch (error) {
    console.error('Failed to get device calendars:', error);
    return [];
  }
}

/**
 * Get device busy blocks from EventKit
 */
export async function getDeviceBusyBlocks(
  startISO: string,
  endISO: string,
  includeIds?: string[]
): Promise<BusyBlock[]> {
  try {
    const result = await CalendarBridge.listEvents({
      startISO,
      endISO,
      calendarIds: includeIds
    });

    return result.events.map((event: BridgeEvent): BusyBlock => ({
      id: event.id,
      calendarId: event.calendarId,
      calendarLabel: event.calendarTitle,
      date: event.dateLocal,
      start_time: event.startLocalISO.slice(11, 16), // Extract HH:MM from ISO string
      end_time: event.endLocalISO.slice(11, 16),     // Extract HH:MM from ISO string
      isAllDay: event.allDay,
      source: 'device_calendar',
      external_id: event.icalUID || event.id
    }));
  } catch (error) {
    console.error('Failed to get device busy blocks:', error);
    return [];
  }
}

/**
 * Check if device calendar access is available
 */
export async function isDeviceCalendarAvailable(): Promise<boolean> {
  try {
    const status = await CalendarBridge.getPermissionStatus();
    return status.status === 'granted';
  } catch (error) {
    console.error('Failed to check device calendar status:', error);
    return false;
  }
}

/**
 * Request device calendar permission
 */
export async function requestDeviceCalendarPermission(): Promise<boolean> {
  try {
    const result = await CalendarBridge.requestAccess();
    return result.granted;
  } catch (error) {
    console.error('Failed to request device calendar permission:', error);
    return false;
  }
}
