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
  transparency?: 'busy' | 'free' | 'oof' | 'tentative';
  status?: 'confirmed' | 'tentative' | 'cancelled';
};

export interface CalendarBridgePlugin {
  requestPermission(): Promise<{ status: 'granted' | 'denied' }>;
  getAuthorizationStatus(): Promise<{ status: string }>;
  getCalendars(): Promise<{ calendars: CalendarInfo[] }>;
  getEvents(opts: { start: string; end: string; calendarIds: string[] }): Promise<{ events: NativeEvent[] }>;
  openEventInCalendar(opts: { eventId: string }): Promise<{ success: boolean; method: string }>;
  openSettings(): Promise<void>;
  addListener(eventName: 'eventStoreChanged', listenerFunc: () => void): Promise<{ remove: () => void }>;
  ping(): Promise<{ ok: boolean }>;
}

export const CalendarBridge = registerPlugin<CalendarBridgePlugin>('CalendarBridge');
