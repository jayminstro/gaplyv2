import { registerPlugin } from '@capacitor/core';

export type PermissionStatus = 'granted' | 'denied' | 'restricted' | 'not_determined';

export interface BridgeCalendar {
  id: string;
  title: string;
  colorHex?: string;
  isSubscribed?: boolean;
  allowsModifications?: boolean;
}

export interface BridgeEvent {
  id: string;
  calendarId: string;
  calendarTitle?: string;
  icalUID?: string;
  allDay?: boolean;
  startLocalISO: string; // e.g. 2025-08-12T09:00:00+01:00
  endLocalISO: string;
  dateLocal: string;     // YYYY-MM-DD
}

export interface CalendarBridgePlugin {
  getPermissionStatus(): Promise<{ status: PermissionStatus }>;
  requestAccess(): Promise<{ granted: boolean }>;
  listCalendars(): Promise<{ calendars: BridgeCalendar[] }>;
  listEvents(opts: { startISO: string; endISO: string; calendarIds?: string[] }): Promise<{ events: BridgeEvent[] }>;
  test(): Promise<{ message: string; timestamp: number }>;
}

const CalendarBridge = registerPlugin<CalendarBridgePlugin>('CalendarBridgePlugin');

export { CalendarBridge };
