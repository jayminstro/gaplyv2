import { Capacitor } from '@capacitor/core';

export interface CalendarPermissionStatus {
  status: 'granted' | 'denied';
}

export interface Calendar {
  id: string;
  title: string;
  color: string;
  type: 'Local' | 'CalDAV' | 'Exchange' | 'Subscribed' | 'Birthday' | 'Other';
  allowsModifications: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: number; // timestamp in milliseconds
  end: number;   // timestamp in milliseconds
  isAllDay: boolean;
}

export interface CalendarBridgeInterface {
  requestPermission(): Promise<CalendarPermissionStatus>;
  getCalendars(): Promise<{ calendars: Calendar[] }>;
  getEvents(opts: { start: string; end: string; calendarIds?: string[] }): Promise<{ events: CalendarEvent[] }>;
  openSettings(): Promise<void>;
}

// Access the native plugin
export const CalendarBridge = Capacitor.isNativePlatform() 
  ? (window as any).CalendarBridge as CalendarBridgeInterface
  : null;
