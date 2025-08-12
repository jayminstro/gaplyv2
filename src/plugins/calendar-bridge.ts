import { registerPlugin } from '@capacitor/core';

export type CalendarInfo = {
  id: string;
  title: string;
  color: string;
  type: 'Local' | 'CalDAV' | 'Exchange' | 'Subscribed' | 'Birthday' | 'Other';
  allowsModifications: boolean;
};

export type NativeEvent = {
  id: string;
  calendarId: string;
  title: string;
  start: number; // ms
  end: number;   // ms
  isAllDay: boolean;
};

export interface CalendarBridgePlugin {
  requestPermission(): Promise<{ status: 'granted' | 'denied' }>;
  getCalendars(): Promise<{ calendars: CalendarInfo[] }>;
  getEvents(opts: { start: string; end: string; calendarIds: string[] }): Promise<{ events: NativeEvent[] }>;
  openSettings(): Promise<void>;
  addListener(eventName: 'eventStoreChanged', listenerFunc: () => void): Promise<{ remove: () => void }>;
  ping(): Promise<{ ok: boolean }>;
}

export const CalendarBridge = registerPlugin<CalendarBridgePlugin>('CalendarBridge');
