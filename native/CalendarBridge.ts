import { Capacitor } from '@capacitor/core';

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

// In Capacitor v7, plugins are automatically discovered
// We need to access them through the Capacitor.Plugins object
export const CalendarBridge: CalendarBridgePlugin = {
  getPermissionStatus: async () => {
    if (Capacitor.getPlatform() === 'ios') {
      return (window as any).CalendarBridgePlugin?.getPermissionStatus() || 
             Promise.reject(new Error('CalendarBridge plugin not available'));
    }
    throw new Error('CalendarBridge only available on iOS');
  },
  
  requestAccess: async () => {
    if (Capacitor.getPlatform() === 'ios') {
      return (window as any).CalendarBridgePlugin?.requestAccess() || 
             Promise.reject(new Error('CalendarBridge plugin not available'));
    }
    throw new Error('CalendarBridge only available on iOS');
  },
  
  listCalendars: async () => {
    if (Capacitor.getPlatform() === 'ios') {
      return (window as any).CalendarBridgePlugin?.listCalendars() || 
             Promise.reject(new Error('CalendarBridge plugin not available'));
    }
    throw new Error('CalendarBridge only available on iOS');
  },
  
  listEvents: async (opts) => {
    if (Capacitor.getPlatform() === 'ios') {
      return (window as any).CalendarBridgePlugin?.listEvents(opts) || 
             Promise.reject(new Error('CalendarBridge plugin not available'));
    }
    throw new Error('CalendarBridge only available on iOS');
  },
  
  test: async () => {
    if (Capacitor.getPlatform() === 'ios') {
      return (window as any).CalendarBridgePlugin?.test() || 
             Promise.reject(new Error('CalendarBridge plugin not available'));
    }
    throw new Error('CalendarBridge only available on iOS');
  }
};
