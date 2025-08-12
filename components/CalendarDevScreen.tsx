import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Calendar, CheckCircle, XCircle, Clock, Settings } from 'lucide-react';
import { CalendarBridge, CalendarInfo, NativeEvent } from '../src/plugins/calendar-bridge';
import { ensurePermissionOrThrow, loadCalendars, fetchWindow, openIOSSettings } from '../src/utils/calendarSource.ios';
import { toast } from 'sonner';

export function CalendarDevScreen() {
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<NativeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    if (!CalendarBridge) {
      setPermissionStatus('denied');
      return;
    }

    try {
      // For now, we'll assume permission is unknown until we request it
      setPermissionStatus('unknown');
    } catch (error) {
      console.error('Error checking permission status:', error);
      setPermissionStatus('denied');
    }
  };

  const requestPermission = async () => {
    if (!CalendarBridge) {
      toast.error('CalendarBridge not available');
      return;
    }

    setIsLoading(true);
    try {
      await ensurePermissionOrThrow();
      setPermissionStatus('granted');
      toast.success('Calendar permission granted!');
      await loadCalendarsData();
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast.error('Calendar permission denied');
      setPermissionStatus('denied');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCalendarsData = async () => {
    if (!CalendarBridge) return;

    try {
      const calendarsData = await loadCalendars();
      setCalendars(calendarsData);
      
      // Auto-select non-subscribed calendars on first load
      const nonSubscribedIds = calendarsData
        .filter(cal => cal.type !== 'Subscribed')
        .map(cal => cal.id);
      setSelectedCalendarIds(nonSubscribedIds);
    } catch (error) {
      console.error('Error loading calendars:', error);
      toast.error('Failed to load calendars');
    }
  };

  const loadEvents = async () => {
    if (!CalendarBridge || selectedCalendarIds.length === 0) return;

    setIsLoading(true);
    try {
      // Get events for the next 7 days
      const now = new Date();
      const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const startISO = now.toISOString();
      const endISO = endDate.toISOString();

      const eventsData = await fetchWindow(selectedCalendarIds, startISO, endISO);

      setEvents(eventsData);
      toast.success(`Loaded ${eventsData.length} events`);
    } catch (error) {
      console.error('Error loading events:', error);
      toast.error('Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const openSettings = async () => {
    if (!CalendarBridge) return;

    try {
      await openIOSSettings();
    } catch (error) {
      console.error('Error opening settings:', error);
      toast.error('Failed to open settings');
    }
  };

  const toggleCalendarSelection = (calendarId: string) => {
    setSelectedCalendarIds(prev => 
      prev.includes(calendarId)
        ? prev.filter(id => id !== calendarId)
        : [...prev, calendarId]
    );
  };

  const formatEventTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatEventDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      weekday: 'short'
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">📅 Calendar Dev Screen</h1>
        <p className="text-slate-400">Test iOS Calendar integration</p>
      </div>

      {/* Permission Status */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Permission Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={permissionStatus === 'granted' ? 'default' : 'secondary'}>
                {permissionStatus === 'granted' ? 'Granted' : 
                 permissionStatus === 'denied' ? 'Denied' : 'Unknown'}
              </Badge>
              {permissionStatus === 'denied' && (
                <Button variant="outline" size="sm" onClick={openSettings}>
                  <Settings className="w-4 h-4 mr-2" />
                  Open Settings
                </Button>
              )}
            </div>
            {permissionStatus === 'unknown' && (
              <div className="space-y-2">
                <Button 
                  onClick={async () => {
                    try {
                      if (CalendarBridge) {
                        const result = await CalendarBridge.ping();
                        console.log('Ping result:', result);
                        toast.success('Ping successful!', { description: 'Plugin is working' });
                      }
                    } catch (error) {
                      console.error('Ping failed:', error);
                      toast.error('Ping failed', { description: 'Plugin not responding' });
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="mr-2"
                >
                  Test Ping
                </Button>
                <Button onClick={requestPermission} disabled={isLoading}>
                  {isLoading ? 'Requesting...' : 'Request Permission'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calendars */}
      {permissionStatus === 'granted' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Available Calendars ({calendars.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full border-2 border-white"
                      style={{ backgroundColor: calendar.color }}
                    />
                    <div>
                      <div className="text-white font-medium">{calendar.title}</div>
                      <div className="text-sm text-slate-400">
                        {calendar.type} • {calendar.allowsModifications ? 'Editable' : 'Read-only'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={selectedCalendarIds.includes(calendar.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCalendarSelection(calendar.id)}
                  >
                    {selectedCalendarIds.includes(calendar.id) ? 'Selected' : 'Select'}
                  </Button>
                </div>
              ))}
            </div>
            
            {calendars.length > 0 && (
              <div className="mt-4">
                <Button 
                  onClick={loadEvents} 
                  disabled={isLoading || selectedCalendarIds.length === 0}
                  className="w-full"
                >
                  {isLoading ? 'Loading Events...' : `Load Events (${selectedCalendarIds.length} calendars)`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Events */}
      {events.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Events ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {events.map((event) => (
                <div key={event.id} className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-white font-medium">{event.title || 'Untitled'}</div>
                      <div className="text-sm text-slate-400">
                        {formatEventDate(event.start)} • {formatEventTime(event.start)} - {formatEventTime(event.end)}
                      </div>
                    </div>
                    {event.isAllDay && (
                      <Badge variant="secondary">All Day</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Debug Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="text-slate-400">
              <span className="font-medium">CalendarBridge Available:</span> {CalendarBridge ? 'Yes' : 'No'}
            </div>
            <div className="text-slate-400">
              <span className="font-medium">Permission Status:</span> {permissionStatus}
            </div>
            <div className="text-slate-400">
              <span className="font-medium">Calendars Loaded:</span> {calendars.length}
            </div>
            <div className="text-slate-400">
              <span className="font-medium">Events Loaded:</span> {events.length}
            </div>
            <div className="text-slate-400">
              <span className="font-medium">Selected Calendars:</span> {selectedCalendarIds.length}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
