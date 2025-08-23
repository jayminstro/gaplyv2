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
  // Rich event properties
  organizer?: {
    name?: string;
    email?: string;
  };
  attendees?: Array<{
    email: string;
    name?: string;
    responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
    isOrganizer?: boolean;
  }>;
  location?: string;
  notes?: string;
  url?: string;
  transparency?: 'opaque' | 'transparent';
  status?: 'none' | 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRules?: string[];
  lastModifiedDate?: number; // timestamp in milliseconds
  creationDate?: number; // timestamp in milliseconds
  // Conference data
  conferenceData?: {
    entryPoints?: Array<{
      uri: string;
      entryPointType: 'video' | 'phone' | 'sip' | 'more';
      label?: string;
    }>;
  };
  // Note: Conference data availability varies by iOS version and calendar type
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
