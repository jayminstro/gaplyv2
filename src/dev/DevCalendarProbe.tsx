import { useEffect, useState } from 'react';
import { startOfDay, endOfDay } from 'date-fns';
import { App } from '@capacitor/app';
import { ensurePermissionOrThrow, loadCalendars, fetchWindow, openIOSSettings } from '../utils/calendarSource.ios';
import { getPermissionStatus } from '../utils/calendarSource.ios';

export default function DevCalendarProbe() {
  const [status, setStatus] = useState<string>('idle');
  const [calendars, setCalendars] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const { status } = await getPermissionStatus();
        setStatus(status);
      } catch {}
    };
    refresh();
    const sub = App.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh(); });
    return () => { sub.then(s => s.remove()); };
  }, []);

  const handlePermission = async () => {
    setStatus('requesting…');
    try {
      await ensurePermissionOrThrow();
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  };

  const handleLoadCalendars = async () => {
    const cals = await loadCalendars();
    setCalendars(cals);
    console.log('Calendars', cals);
  };

  const handleFetchToday = async () => {
    const start = startOfDay(new Date()).toISOString();
    const end = endOfDay(new Date()).toISOString();
    const ids = calendars.map(c => c.id); // for smoke test, query all
    const evts = await fetchWindow(ids, start, end);
    setEvents(evts);
    console.log('Events', evts);
  };

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm text-muted-foreground">Status: {status}</div>
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded-xl border" onClick={handlePermission}>Request Permission</button>
        <button className="px-3 py-2 rounded-xl border" onClick={handleLoadCalendars}>Load Calendars</button>
        <button className="px-3 py-2 rounded-xl border" onClick={handleFetchToday}>Fetch Today</button>
        {status === 'denied' && (
          <button className="px-3 py-2 rounded-xl border" onClick={openIOSSettings}>Open Settings</button>
        )}
      </div>
      <pre className="text-xs bg-muted/30 p-2 rounded-xl overflow-auto max-h-64">{JSON.stringify(calendars, null, 2)}</pre>
      <pre className="text-xs bg-muted/30 p-2 rounded-xl overflow-auto max-h-64">{JSON.stringify(events, null, 2)}</pre>
    </div>
  );
}
