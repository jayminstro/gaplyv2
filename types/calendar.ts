export type CalendarBusyBlock = {
  date: string; // YYYY-MM-DD in prefs.timezone
  start_time: string; // HH:mm in prefs.timezone
  end_time: string; // HH:mm
  source: 'device' | 'google';
  calendarId?: string;
  title?: string;
  isAllDay?: boolean;
  uid?: string;
  recurrenceId?: string;
  transparency?: 'busy' | 'free' | 'oof' | 'tentative';
  status?: 'confirmed' | 'tentative' | 'cancelled';
  lastSyncedAt: string; // ingest timestamp
};

export type DateRange = { start: string; end: string }; // inclusive YYYY-MM-DD

