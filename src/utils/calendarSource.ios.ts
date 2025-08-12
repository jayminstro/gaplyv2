import { CalendarBridge } from '../plugins/calendar-bridge';

export async function ensurePermissionOrThrow() {
  const { status } = await CalendarBridge.requestPermission();
  if (status !== 'granted') throw new Error('denied');
}

export async function loadCalendars() {
  const { calendars } = await CalendarBridge.getCalendars();
  return calendars;
}

export async function fetchWindow(calIds: string[], startISO: string, endISO: string) {
  const { events } = await CalendarBridge.getEvents({ start: startISO, end: endISO, calendarIds: calIds });
  return events;
}

export async function openIOSSettings() {
  try { await CalendarBridge.openSettings(); } catch {}
}

export async function getPermissionStatus() {
  return CalendarBridge.getAuthorizationStatus();
}
