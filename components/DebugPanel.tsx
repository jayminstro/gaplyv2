import { useState, useEffect } from 'react';
import { Bug, Play, Database, CheckCircle, XCircle, Calendar, ShieldCheck, CalendarRange } from 'lucide-react';
import { debugDataSaving } from '../utils/debug';
import { supabase } from '../utils/supabase/client';
import { tasksAPI } from '../utils/api';
import { Task } from '../types/index';
import { CalendarBridge } from '../src/plugins/calendar-bridge';
import { calendarService } from '../utils/calendar/index';
import { EnhancedStorageManager } from '../utils/storage/EnhancedStorageManager';
import { DEFAULT_PREFERENCES } from '../utils/constants';
import { Switch } from './ui/switch';
import { toast } from 'sonner';

interface DebugPanelProps {
  isVisible?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export function DebugPanel({ isVisible = true, onClose, embedded = false }: DebugPanelProps) {
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [calendarDiag, setCalendarDiag] = useState<{
    permission: string | null;
    calendars: any[] | null;
    busy: any[] | null;
    error: string | null;
    debugMode: boolean;
  }>({
    permission: null,
    calendars: null,
    busy: null,
    error: null,
    debugMode: false
  });

  // Check debug mode on mount
  useEffect(() => {
    checkDebugMode();
  }, []);

  if (!isVisible) return null;

  const runDebugTests = async () => {
    setIsRunning(true);
    console.log('🚀 Starting comprehensive debug tests...');
    
    try {
      // Run full diagnosis with task creation (manual trigger only)
      const results: any = await debugDataSaving.runFullDiagnosisWithTaskCreation();
      
      // Test task creation and saving via API
      const testTask: Task = {
        id: `debug-${Date.now()}`,
        title: 'Debug Panel Test Task',
        category: 'Testing',
        duration: '00:15:00',
        status: 'draft',
        iconColor: 'text-blue-400',
        icon: 'TestTube',
        notes: 'This is a debug test task created manually'
      };
      
      console.log('🧪 Testing task API save/retrieve cycle...');
      
      // Test saving a single task via API
      try {
        await tasksAPI.save([testTask]);
        console.log('✅ Task API save successful');
        
        // Verify by retrieving
        const retrievedTasks = await tasksAPI.get();
        console.log('📋 Retrieved tasks:', retrievedTasks);
        
        const foundTask = retrievedTasks.find((t: any) => t.id === testTask.id);
        if (foundTask) {
          console.log('✅ Test task found in retrieved data');
          results.taskSaveTest = true;
        } else {
          console.log('❌ Test task NOT found in retrieved data');
          results.taskSaveTest = false;
        }
      } catch (taskError: any) {
        console.error('❌ Task API save/retrieve test failed:', taskError);
        results.taskSaveTest = false;
        results.taskError = taskError?.message || String(taskError);
      }
      
      setTestResults(results);
    } catch (error: any) {
      console.error('❌ Debug tests failed:', error);
      setTestResults({ error: error?.message || String(error) });
    } finally {
      setIsRunning(false);
    }
  };

  const clearTestData = async () => {
    try {
      console.log('🧹 Clearing all debug test data...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.error('❌ No user session for clearing data');
        return;
      }

      // Delete debug tasks with different naming patterns
      const deleteOperations = [
        // Debug panel tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).like('id', 'debug-%'),
        // Schema test tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('title', 'Schema Test'),
        // Debug test tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('title', 'Debug Test Task'),
        // Category-based debug tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('category', 'Debugging'),
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('category', 'Testing'),
        // Note-based debug tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).like('notes', '%Debug test task%')
      ];

      const results = await Promise.allSettled(deleteOperations);
      
      let deletedCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && !(result.value as any).error) {
          console.log(`✅ Cleared debug tasks (operation ${index + 1})`);
          deletedCount++;
        } else if (result.status === 'rejected' || (result as any).value?.error) {
          console.error(`❌ Failed to clear some debug tasks (operation ${index + 1}):`);
        }
      });

      console.log(`✅ Test data cleanup completed (${deletedCount}/${deleteOperations.length} operations successful)`);
    } catch (error) {
      console.error('❌ Failed to clear test data:', error);
    }
  };

  const checkCalendarPermission = async () => {
    try {
      const status = await CalendarBridge.getAuthorizationStatus();
      setCalendarDiag((prev: any) => ({ ...prev, permission: status.status, error: null }));
    } catch (e: unknown) {
      const err = (e as any)?.message || String(e);
      setCalendarDiag((prev: any) => ({ ...prev, error: err }));
    }
  };

  const requestCalendarPermission = async () => {
    try {
      const res = await CalendarBridge.requestPermission();
      setCalendarDiag((prev: any) => ({ ...prev, permission: res.status, error: null }));
    } catch (e: unknown) {
      const err = (e as any)?.message || String(e);
      setCalendarDiag((prev: any) => ({ ...prev, error: err }));
    }
  };

  const listDeviceCalendars = async () => {
    try {
      const res = await CalendarBridge.getCalendars();
      setCalendarDiag((prev: any) => ({ ...prev, calendars: res.calendars || [], error: null }));
    } catch (e: unknown) {
      const err = (e as any)?.message || String(e);
      setCalendarDiag((prev: any) => ({ ...prev, error: err }));
    }
  };

  const enableDebugMode = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id || 'local-user';
      const esm = new EnhancedStorageManager(uid);
      await esm.initialize();
      let preferences: any = await esm.getPreferences();
      if (!preferences) preferences = { ...DEFAULT_PREFERENCES };
      preferences.debugCalendarSync = true;
      await esm.savePreferences(preferences);
      setCalendarDiag((prev: any) => ({ ...prev, debugMode: true }));
      toast.success('Calendar debug mode enabled');
    } catch (e) {
      console.error('Failed to enable debug mode:', e);
      toast.error('Failed to enable debug mode');
    }
  };

  const checkDebugMode = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id || 'local-user';
      const esm = new EnhancedStorageManager(uid);
      await esm.initialize();
      let preferences: any = await esm.getPreferences();
      if (!preferences) preferences = { ...DEFAULT_PREFERENCES };
      const debugEnabled = !!preferences.debugCalendarSync;
      setCalendarDiag((prev: any) => ({ ...prev, debugMode: debugEnabled }));
      toast.info('Debug mode status checked.');
    } catch (e) {
      console.error('Failed to check debug mode:', e);
      toast.error('Failed to check debug mode status.');
    }
  };

  const fetchTodayBusyBlocks = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id || 'local-user';
      const esm = new EnhancedStorageManager(uid);
      await esm.initialize();
      let preferences: any = await esm.getPreferences();
      if (!preferences) preferences = { ...DEFAULT_PREFERENCES };
      
      // Check debug mode status
      const debugEnabled = !!preferences.debugCalendarSync;
      setCalendarDiag((prev: any) => ({ ...prev, debugMode: debugEnabled }));
      
      const today = new Date().toLocaleDateString('en-CA');
      const blocks = await calendarService.getBusyBlocks({ start: today, end: today }, preferences);
      
      let hint = null;
      if (!preferences.show_device_calendar_busy && !debugEnabled) {
        hint = 'Note: show_device_calendar_busy is disabled and debug mode is off. Enable debug mode to test calendar fetching.';
      } else if (!preferences.show_device_calendar_busy && debugEnabled) {
        hint = 'Note: show_device_calendar_busy is disabled but debug mode is enabled for testing.';
      }
      
      setCalendarDiag((prev: any) => ({ ...prev, busy: blocks, error: hint }));
    } catch (e: unknown) {
      const err = (e as any)?.message || String(e);
      setCalendarDiag((prev: any) => ({ ...prev, error: err }));
    }
  };

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm text-white font-medium">Debug Tools</h3>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Calendar Diagnostics</h3>
            
            {/* Debug Calendar Sync Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3 flex-1">
                <div className="text-slate-300 text-sm">Enable Calendar Debug Mode</div>
                <div className="text-slate-400 text-xs">Bypass preference checks for testing</div>
              </div>
              <Switch 
                checked={calendarDiag.debugMode || false} 
                onCheckedChange={(checked) => {
                  if (checked) {
                    enableDebugMode();
                  } else {
                    // For now, only allow enabling debug mode
                    toast.info('Use the Check Debug Mode button to see current status');
                  }
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button onClick={checkCalendarPermission} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Check Permission</button>
              <button onClick={requestCalendarPermission} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Request Permission</button>
              <button onClick={listDeviceCalendars} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded flex items-center justify-center gap-2"><CalendarRange className="w-4 h-4" /> List Calendars</button>
              <button onClick={fetchTodayBusyBlocks} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded flex items-center justify-center gap-2"><CalendarRange className="w-4 h-4" /> Fetch Today Busy</button>
              <button onClick={checkDebugMode} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Check Debug Mode</button>
              <button onClick={enableDebugMode} className="bg-green-700 hover:bg-green-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Enable Debug Mode</button>
              <button onClick={async () => {
                try {
                  const res = await CalendarBridge.ping();
                  toast.success(`Calendar bridge ping: ${res.ok ? 'OK' : 'Failed'}`);
                  console.log('🔧 Calendar bridge ping result:', res);
                } catch (e) {
                  toast.error('Calendar bridge ping failed');
                  console.error('🔧 Calendar bridge ping error:', e);
                }
              }} className="bg-blue-700 hover:bg-blue-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Ping Bridge</button>
              <button onClick={async () => {
                try {
                  const today = new Date().toLocaleDateString('en-CA');
                  const res = await CalendarBridge.getEvents({ 
                    start: today, 
                    end: today, 
                    calendarIds: [] 
                  });
                  toast.success(`Direct bridge events: ${res.events?.length || 0} events`);
                  console.log('🔧 Direct bridge events result:', res);
                } catch (e) {
                  toast.error('Direct bridge events failed');
                  console.error('🔧 Direct bridge events error:', e);
                }
              }} className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Bridge Events</button>
              <button onClick={async () => {
                try {
                  // Test with proper ISO datetime strings
                  const today = new Date();
                  const startISO = today.toISOString();
                  const endISO = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Next day
                  
                  const res = await CalendarBridge.getEvents({ 
                    start: startISO, 
                    end: endISO, 
                    calendarIds: [] 
                  });
                  toast.success(`ISO bridge events: ${res.events?.length || 0} events`);
                  console.log('🔧 ISO bridge events result:', { startISO, endISO, res });
                } catch (e) {
                  toast.error('ISO bridge events failed');
                  console.error('🔧 ISO bridge events error:', e);
                }
              }} className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test ISO Events</button>
              <button onClick={async () => {
                try {
                  // Test with a very broad date range using ISO strings
                  const startDate = new Date();
                  startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago
                  const endDate = new Date();
                  endDate.setFullYear(endDate.getFullYear() + 1); // 1 year from now
                  
                  const startISO = startDate.toISOString();
                  const endISO = endDate.toISOString();
                  
                  console.log('🔧 Testing very broad ISO date range:', { startISO, endISO });
                  
                  const res = await CalendarBridge.getEvents({ 
                    start: startISO, 
                    end: endISO, 
                    calendarIds: [] 
                  });
                  
                  if (res.events && res.events.length > 0) {
                    toast.success(`Found ${res.events.length} events in ISO broad range`);
                    console.log('🔧 ISO broad range events found:', res.events.slice(0, 3)); // Show first 3
                  } else {
                    toast.warning('No events found in ISO broad range');
                    console.log('🔧 No events found in ISO broad range');
                  }
                  
                  console.log('🔧 Very broad ISO range result:', { startISO, endISO, res });
                } catch (e) {
                  toast.error('Very broad ISO range test failed');
                  console.error('🔧 Very broad ISO range test error:', e);
                }
              }} className="bg-violet-700 hover:bg-violet-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Very Broad ISO Range</button>
              <button onClick={async () => {
                try {
                  // Test with different permission statuses using ISO strings
                  const permissionRes = await CalendarBridge.getAuthorizationStatus();
                  console.log('🔧 Current permission status:', permissionRes);
                  
                  if (permissionRes.status === 'denied' || permissionRes.status === 'restricted') {
                    toast.warning(`Permission status: ${permissionRes.status}`);
                    return;
                  }
                  
                  // Try to request permission if not granted
                  if (permissionRes.status !== 'granted' && permissionRes.status !== 'fullAccess' && permissionRes.status !== 'authorized') {
                    try {
                      const requestRes = await CalendarBridge.requestPermission();
                      console.log('🔧 Permission request result:', requestRes);
                      toast.success(`Permission request: ${requestRes.status}`);
                    } catch (e) {
                      console.log('🔧 Permission request failed:', e);
                      toast.error('Permission request failed');
                    }
                  } else {
                    toast.success(`Permission already granted: ${permissionRes.status}`);
                  }
                  
                  // Now try to get events with ISO strings
                  const today = new Date();
                  const startISO = today.toISOString();
                  const endISO = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
                  
                  const res = await CalendarBridge.getEvents({ 
                    start: startISO, 
                    end: endISO, 
                    calendarIds: [] 
                  });
                  
                  console.log('🔧 Events after permission check (ISO):', { startISO, endISO, res });
                  if (res.events && res.events.length > 0) {
                    toast.success(`Found ${res.events.length} events after permission check (ISO)`);
                  } else {
                    toast.warning('No events found after permission check (ISO)');
                  }
                  
                } catch (e) {
                  toast.error('Permission ISO test failed');
                  console.error('🔧 Permission ISO test error:', e);
                }
              }} className="bg-rose-700 hover:bg-rose-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Permissions ISO</button>
              <button onClick={async () => {
                try {
                  // Test with different calendar ID formats using ISO strings
                  const calendarsRes = await CalendarBridge.getCalendars();
                  const calendars = calendarsRes.calendars || [];
                  
                  if (calendars.length === 0) {
                    toast.warning('No calendars available');
                    return;
                  }
                  
                  const today = new Date();
                  const startISO = today.toISOString();
                  const endISO = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
                  
                  // Test with different calendar ID formats
                  const testFormats = [
                    [], // Empty array
                    [''], // Empty string
                    ['invalid-id'], // Invalid ID
                    calendars.map(c => c.id), // All valid IDs
                    calendars.slice(0, 1).map(c => c.id), // First calendar only
                    calendars.slice(-1).map(c => c.id), // Last calendar only
                  ];
                  
                  console.log('🔧 Testing different calendar ID formats with ISO:', testFormats);
                  
                  for (const [index, calendarIds] of testFormats.entries()) {
                    try {
                      const res = await CalendarBridge.getEvents({ 
                        start: startISO, 
                        end: endISO, 
                        calendarIds 
                      });
                      console.log(`🔧 Calendar ID format ${index} ISO result:`, { calendarIds, startISO, endISO, res });
                      if (res.events && res.events.length > 0) {
                        toast.success(`Found events with format ${index} (ISO): ${calendarIds.join(', ')}`);
                        break;
                      }
                    } catch (e) {
                      console.log(`🔧 Calendar ID format ${index} ISO failed:`, e);
                    }
                  }
                  
                  toast.info('Calendar ID format ISO test completed');
                } catch (e) {
                  toast.error('Calendar ID format ISO test failed');
                  console.error('🔧 Calendar ID format ISO test error:', e);
                }
              }} className="bg-sky-700 hover:bg-sky-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Calendar IDs ISO</button>
              <button onClick={async () => {
                try {
                  // Test with different event dates using ISO strings
                  const today = new Date();
                  const testDates = [
                    today.toISOString(), // Today
                    new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
                    new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
                    new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
                    new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
                  ];
                  
                  console.log('🔧 Testing different event dates with ISO:', testDates);
                  
                  for (const date of testDates) {
                    try {
                      const endDate = new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString();
                      const res = await CalendarBridge.getEvents({ 
                        start: date, 
                        end: endDate, 
                        calendarIds: [] 
                      });
                      console.log(`🔧 Date "${date}" ISO result:`, res);
                      if (res.events && res.events.length > 0) {
                        toast.success(`Found events on: ${date}`);
                        break;
                      }
                    } catch (e) {
                      console.log(`🔧 Date "${date}" ISO failed:`, e);
                    }
                  }
                  
                  toast.info('Event date ISO test completed');
                } catch (e) {
                  toast.error('Event date ISO test failed');
                  console.error('🔧 Event date ISO test error:', e);
                }
              }} className="bg-fuchsia-700 hover:bg-fuchsia-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Event Dates ISO</button>
              <button onClick={async () => {
                try {
                  // Test with different calendar types using ISO strings
                  const calendarsRes = await CalendarBridge.getCalendars();
                  const calendars = calendarsRes.calendars || [];
                  
                  if (calendars.length === 0) {
                    toast.warning('No calendars available');
                    return;
                  }
                  
                  // Group calendars by type
                  const calendarsByType = calendars.reduce((acc, cal) => {
                    const type = cal.type || 'Unknown';
                    if (!acc[type]) acc[type] = [];
                    acc[type].push(cal);
                    return acc;
                  }, {} as Record<string, any[]>);
                  
                  console.log('🔧 Calendars by type:', calendarsByType);
                  
                  const today = new Date();
                  const startISO = today.toISOString();
                  const endISO = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
                  
                  for (const [type, typeCalendars] of Object.entries(calendarsByType)) {
                    try {
                      const calendarIds = typeCalendars.map(c => c.id);
                      const res = await CalendarBridge.getEvents({ 
                        start: startISO, 
                        end: endISO, 
                        calendarIds 
                      });
                      console.log(`🔧 Calendar type "${type}" ISO result:`, { calendarIds, startISO, endISO, res });
                      if (res.events && res.events.length > 0) {
                        toast.success(`Found events with calendar type: ${type}`);
                        break;
                      }
                    } catch (e) {
                      console.log(`🔧 Calendar type "${type}" ISO failed:`, e);
                    }
                  }
                  
                  toast.info('Calendar type ISO test completed');
                } catch (e) {
                  toast.error('Calendar type ISO test failed');
                  console.error('🔧 Calendar type ISO test error:', e);
                }
              }} className="bg-amber-700 hover:bg-amber-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Calendar Types ISO</button>
              <button onClick={async () => {
                try {
                  // Test with single calendar using ISO strings
                  const calendarsRes = await CalendarBridge.getCalendars();
                  const calendars = calendarsRes.calendars || [];
                  
                  if (calendars.length === 0) {
                    toast.warning('No calendars available');
                    return;
                  }
                  
                  // Test with the first calendar
                  const firstCalendar = calendars[0];
                  const today = new Date();
                  const startISO = today.toISOString();
                  const endISO = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
                  
                  const res = await CalendarBridge.getEvents({ 
                    start: startISO, 
                    end: endISO, 
                    calendarIds: [firstCalendar.id] 
                  });
                  
                  toast.success(`Single calendar ISO events: ${res.events?.length || 0} events from ${firstCalendar.title}`);
                  console.log('🔧 Single calendar ISO events result:', { calendar: firstCalendar, startISO, endISO, res });
                } catch (e) {
                  toast.error('Single calendar ISO events failed');
                  console.error('🔧 Single calendar ISO events error:', e);
                }
              }} className="bg-cyan-700 hover:bg-cyan-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Test Single Calendar ISO</button>
              <button onClick={async () => {
                try {
                  const { data } = await supabase.auth.getSession();
                  const uid = data.session?.user?.id || 'local-user';
                  const esm = new EnhancedStorageManager(uid);
                  await esm.initialize();
                  let preferences: any = await esm.getPreferences();
                  if (!preferences) preferences = { ...DEFAULT_PREFERENCES };
                  
                  const relevantPrefs = {
                    show_device_calendar_busy: preferences.show_device_calendar_busy,
                    show_device_calendar_titles: preferences.show_device_calendar_titles,
                    device_calendar_included_ids: preferences.device_calendar_included_ids,
                    debugCalendarSync: preferences.debugCalendarSync
                  };
                  
                  toast.success('Preferences checked');
                  console.log('🔧 Current relevant preferences:', relevantPrefs);
                  setCalendarDiag((prev: any) => ({ ...prev, error: `Prefs: ${JSON.stringify(relevantPrefs)}` }));
                } catch (e) {
                  toast.error('Failed to check preferences');
                  console.error('🔧 Preferences check error:', e);
                }
              }} className="bg-yellow-700 hover:bg-yellow-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Check Prefs</button>
              <button onClick={async () => {
                try {
                  const { data } = await supabase.auth.getSession();
                  const uid = data.session?.user?.id || 'local-user';
                  const localStorageKey = `gaply_device_calendar_${uid}`;
                  const raw = localStorage.getItem(localStorageKey);
                  const fallback = raw ? JSON.parse(raw) : {};
                  
                  toast.success('localStorage checked');
                  console.log('🔧 localStorage fallback:', { key: localStorageKey, value: fallback });
                  setCalendarDiag((prev: any) => ({ ...prev, error: `localStorage: ${JSON.stringify(fallback)}` }));
                } catch (e) {
                  toast.error('Failed to check localStorage');
                  console.error('🔧 localStorage check error:', e);
                }
              }} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Check localStorage</button>
              <button onClick={async () => {
                try {
                  const { data } = await supabase.auth.getSession();
                  const uid = data.session?.user?.id || 'local-user';
                  const localStorageKey = `gaply_device_calendar_${uid}`;
                  const fallback = {
                    show_device_calendar_busy: true,
                    show_device_calendar_titles: false,
                    device_calendar_included_ids: []
                  };
                  localStorage.setItem(localStorageKey, JSON.stringify(fallback));
                  
                  toast.success('localStorage fallback set');
                  console.log('🔧 Set localStorage fallback:', fallback);
                } catch (e) {
                  toast.error('Failed to set localStorage');
                  console.error('🔧 localStorage set error:', e);
                }
              }} className="bg-indigo-700 hover:bg-indigo-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Set localStorage</button>
              <button onClick={() => {
                toast.success('Refreshing page...');
                setTimeout(() => window.location.reload(), 1000);
              }} className="bg-red-700 hover:bg-red-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Refresh Page</button>
              <button onClick={() => {
                try {
                  // Check if CalendarBridge is available
                  if (typeof CalendarBridge !== 'undefined') {
                    console.log('🔧 CalendarBridge is available:', CalendarBridge);
                    toast.success('CalendarBridge available');
                  } else {
                    console.log('🔧 CalendarBridge is NOT available');
                    toast.error('CalendarBridge not available');
                  }
                  
                  // Check if the plugin methods exist
                  const methods = ['ping', 'getEvents', 'getCalendars', 'requestPermission'];
                  const availableMethods = methods.filter(method => typeof CalendarBridge[method as keyof typeof CalendarBridge] === 'function');
                  console.log('🔧 Available CalendarBridge methods:', availableMethods);
                  
                  if (availableMethods.length === methods.length) {
                    toast.success(`All methods available: ${availableMethods.join(', ')}`);
                  } else {
                    toast.warning(`Some methods missing. Available: ${availableMethods.join(', ')}`);
                  }
                } catch (e) {
                  console.error('🔧 CalendarBridge check error:', e);
                  toast.error('CalendarBridge check failed');
                }
              }} className="bg-teal-700 hover:bg-teal-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Check Bridge</button>
              <button onClick={async () => {
                try {
                  const { data } = await supabase.auth.getSession();
                  const uid = data.session?.user?.id || 'local-user';
                  const esm = new EnhancedStorageManager(uid);
                  await esm.initialize();
                  let preferences: any = await esm.getPreferences();
                  if (!preferences) preferences = { ...DEFAULT_PREFERENCES };
                  
                  preferences.show_device_calendar_busy = true;
                  await esm.savePreferences(preferences);
                  
                  toast.success('Device calendar enabled for testing');
                  console.log('🔧 Manually enabled device calendar busy');
                } catch (e) {
                  toast.error('Failed to enable device calendar');
                  console.error('🔧 Enable device calendar error:', e);
                }
              }} className="bg-orange-700 hover:bg-orange-600 text-white p-2 rounded flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Enable Calendar</button>
            </div>
            <div className="text-slate-300 text-sm space-y-2">
              {calendarDiag.permission && <div>Permission: <span className="text-white">{calendarDiag.permission}</span></div>}
              {Array.isArray(calendarDiag.calendars) && (
                <div>
                  Calendars: <span className="text-white">{calendarDiag.calendars.length}</span>
                </div>
              )}
              {Array.isArray(calendarDiag.busy) && (
                <div>
                  Busy blocks today: <span className="text-white">{calendarDiag.busy.length}</span>
                </div>
              )}
              <div>
                Debug Mode: <span className={calendarDiag.debugMode ? 'text-green-400' : 'text-red-400'}>{calendarDiag.debugMode ? 'ON' : 'OFF'}</span>
              </div>
              {calendarDiag.error && (
                <div className="text-red-400">Error: {calendarDiag.error}</div>
              )}
            </div>
          </div>
          <button
            onClick={runDebugTests}
            disabled={isRunning}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Running Tests...' : 'Run Debug Tests'}
          </button>

          <button
            onClick={clearTestData}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            Clear Test Data
          </button>

          {testResults && (
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-white font-medium mb-3">Test Results:</h3>
              
              {testResults.error ? (
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>Error: {testResults.error}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 ${testResults.environment ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.environment ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Environment Config</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.auth ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.auth ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Authentication</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.api ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.api ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>API Connectivity</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.schema ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.schema ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Schema</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directQuery ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directQuery ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Query</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directInsertion ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directInsertion ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Direct DB Insert</span>
                  </div>
                  
                  {testResults.taskSaveTest !== undefined && (
                    <div className={`flex items-center gap-2 ${testResults.taskSaveTest ? 'text-green-400' : 'text-red-400'}`}>
                      {testResults.taskSaveTest ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span>Task Save/Retrieve</span>
                    </div>
                  )}
                  
                  {testResults.taskError && (
                    <div className="text-red-400 text-sm mt-2">
                      Task Error: {testResults.taskError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-slate-400 text-sm">
            <p>This panel runs comprehensive tests to identify data saving issues:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Authentication status</li>
              <li>API server connectivity</li>
              <li>Database permissions</li>
              <li>Direct database operations</li>
              <li>Task save/retrieve cycle</li>
            </ul>
            <p className="mt-2">Check the browser console for detailed logs.</p>
          </div>
        </div>
      </div>
    );
  }

  // Non-embedded: hide by default in production builds
  return null;
}