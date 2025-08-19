import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { PlannerTimeline } from './PlannerTimeline';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { GapsAPI } from '../utils/gapsAPI';
import { useGaps } from '../hooks/useGaps';
import { mergeAndDeduplicateGaps, GapLogic } from '../utils/gapLogic';
import { minutesToTime, timeToMinutes } from '../utils/helpers';
import { fetchWindow as fetchDeviceWindow, loadCalendars as loadDeviceCalendars } from '../src/utils/calendarSource.ios';
import { normalizeWorkingDays } from '../utils/gapLogic';

interface PlannerContentProps {
  globalTasks: Task[];
  gaps: TimeGap[];
  onTaskOpen: (task: Task) => void;
  onTaskEdit: (task: Task) => void;
  onGapUtilize: (gap: TimeGap) => void;
  userPreferences?: UserPreferences;
  session?: any;
  storageManager?: any; // Add storage manager prop
}

function PlannerContent({ 
  globalTasks, 
  gaps, 
  onTaskOpen, 
  onTaskEdit,
  onGapUtilize,
  userPreferences,
  session,
  storageManager
}: PlannerContentProps) {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overrideWorkingDays, setOverrideWorkingDays] = useState<string[] | null>(null);
  
  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  // Listen for live working days changes from settings (preview without save)
  useEffect(() => {
    const handleWorkingDaysPreview = (event: Event) => {
      const customEvent = event as CustomEvent<string[] | null>;
      if (Array.isArray(customEvent.detail)) {
        setOverrideWorkingDays(customEvent.detail);
      } else {
        setOverrideWorkingDays(null);
      }
    };
    window.addEventListener('workingDaysPreviewChange', handleWorkingDaysPreview as EventListener);
    return () => window.removeEventListener('workingDaysPreviewChange', handleWorkingDaysPreview as EventListener);
  }, []);

  // Track which dates we've already attempted to create gaps for
  const [processedDates, setProcessedDates] = useState<Set<string>>(new Set());

  // Ensure gaps exist for the selected date (simplified - let App.tsx handle bulk gap creation)
  useEffect(() => {
    const ensureGapsForSelectedDate = async () => {
      if (!session?.access_token || !userPreferences) {
        console.log('⏭️ Missing required dependencies for gap creation');
        return;
      }
      
      // Ensure userPreferences has required fields
      if (!userPreferences.calendar_work_start || !userPreferences.calendar_work_end || !userPreferences.calendar_working_days) {
        console.log('⏭️ Missing required preference fields for gap creation');
        return;
      }
      
      // Use local date strings to avoid timezone issues
      const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Debug: Log the dates being processed
      console.log(`🔍 Processing date: ${selectedDateStr}, Today: ${today}`);
      
      // Prevent infinite loops by tracking processed dates
      if (processedDates.has(selectedDateStr)) {
        console.log(`⏭️ Date ${selectedDateStr} already processed, skipping`);
        return;
      }
      
      // Allow past dates within rolling window so timeline can show historic gaps
      
      // Check if date is within the 14-day rolling window
      const { GapLogic } = await import('../utils/gapLogic');
      if (!GapLogic.isDateInRollingWindow(selectedDateStr)) {
        console.log(`⏭️ Skipping date outside rolling window: ${selectedDateStr}`);
        setProcessedDates(prev => new Set([...prev, selectedDateStr]));
        return;
      }
      
      // Check if we have gaps for the selected date
      const gapsForSelectedDate = gaps.filter(gap => {
        if (!gap.date) return false;
        const gapDate = startOfDay(new Date(gap.date));
        return isSameDay(gapDate, selectedDate);
      });
      
      // If no gaps exist for this date, create them
      if (gapsForSelectedDate.length === 0) {
        try {
          console.log(`🔄 No gaps found for ${selectedDateStr}, creating default gaps...`);
          
          // Mark this date as processed to prevent infinite loops
          setProcessedDates(prev => new Set([...prev, selectedDateStr]));
          
          // Try to get existing gaps for the date first
          let gapsForDate: TimeGap[] = [];
          
          try {
            gapsForDate = await GapsAPI.getGapsForDate(selectedDateStr, session.access_token);
            console.log(`✅ Retrieved ${gapsForDate.length} existing gaps for ${selectedDateStr}`);
          } catch (fetchError) {
            console.log('🔄 Failed to fetch existing gaps, will try to initialize');
            gapsForDate = [];
          }
          
          if (gapsForDate.length === 0) {
            console.log('📝 No gaps found, initializing default gaps...');
            
            // Debug user preferences before gap creation
            console.log(`🔍 DEBUG - PlannerContent userPreferences:`, JSON.stringify({
              calendar_work_start: userPreferences?.calendar_work_start,
              calendar_work_end: userPreferences?.calendar_work_end,
              calendar_working_days: userPreferences?.calendar_working_days,
            }, null, 2));
            
            try {
              gapsForDate = await GapsAPI.initializeGapsForDate(selectedDateStr, userPreferences, session.access_token, session?.user?.id, storageManager);
              console.log(`✅ Initialized ${gapsForDate.length} gaps for ${selectedDateStr}`);
            } catch (initError) {
              console.log('🔄 API initialization failed, creating local default gaps');
              gapsForDate = await GapsAPI.createLocalFallbackGaps(selectedDateStr, userPreferences, session?.user?.id || 'local-user', storageManager);
              console.log(`✅ Created ${gapsForDate.length} local default gaps as fallback`);
            }
          }
          
          if (gapsForDate.length > 0) {
            console.log(`✅ Created ${gapsForDate.length} gaps for ${selectedDateStr}`);
            // Proactively update app state via event so planner reflects immediately
            try {
              const merged = mergeAndDeduplicateGaps(gaps, gapsForDate);
              window.dispatchEvent(new CustomEvent('forceReloadGaps', { detail: { gaps: merged } }));
            } catch (e) {
              console.warn('⚠️ Failed to broadcast new gaps to app state:', e);
            }
          }
        } catch (error) {
          console.error('❌ Error creating gaps for selected date:', error);
        }
      } else {
        // If gaps exist, mark the date as processed
        setProcessedDates(prev => new Set([...prev, selectedDateStr]));
      }
    };
    
    ensureGapsForSelectedDate();
  }, [selectedDate, session?.access_token, userPreferences, processedDates, gaps]);

  // Reset processed dates when user changes
  useEffect(() => {
    setProcessedDates(new Set());
  }, [session?.access_token]);

  // Generate date tabs (7 days in past + today + 7 days forward = 15 total) filtered by working days
  const workingDays = useMemo(() => {
    if (overrideWorkingDays && overrideWorkingDays.length > 0) {
      return normalizeWorkingDays(overrideWorkingDays);
    }
    return normalizeWorkingDays(userPreferences?.calendar_working_days);
  }, [overrideWorkingDays, userPreferences?.calendar_working_days]);
  const dateTabs = useMemo(() => {
    const allTabs = Array.from({ length: 15 }, (_, index) => {
      const date = addDays(new Date(), index - 7);
      return {
        date: startOfDay(date),
        label: format(date, 'EEE'),
        isToday: isSameDay(startOfDay(date), startOfDay(new Date()))
      };
    });
    // Filter to only user's working days
    return allTabs.filter(tab => {
      const dayName = tab.date.toLocaleDateString('en-US', { weekday: 'long' });
      return workingDays.includes(dayName);
    });
  }, [workingDays]);

  const isSelectedDateWorkingDay = useMemo(() => {
    const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    return workingDays.includes(dayName);
  }, [selectedDate, workingDays]);

  // Ensure selected date is always one of the visible working days
  useEffect(() => {
    if (dateTabs.length === 0) return;
    const isSelectedVisible = dateTabs.some(tab => isSameDay(tab.date, selectedDate));
    if (!isSelectedVisible) {
      // Pick the closest visible date to today
      const today = startOfDay(new Date());
      // Prefer today if visible
      const todayTab = dateTabs.find(tab => isSameDay(tab.date, today));
      if (todayTab) {
        setSelectedDate(todayTab.date);
        return;
      }
      // Otherwise choose the first future working day, else fallback to last past working day
      const futureTab = dateTabs.find(tab => tab.date >= today);
      setSelectedDate(futureTab ? futureTab.date : dateTabs[dateTabs.length - 1].date);
    }
  }, [dateTabs]);

  // Filter tasks for selected date - Temporarily show all tasks for debugging
  const selectedDateTasks = globalTasks.filter(task => {
    // Temporarily show all tasks for debugging
    if (!task.dueDate) {
      console.log(`🔍 Task ${task.title} has no dueDate, showing anyway for debugging`);
      return true;
    }
    const taskDate = startOfDay(new Date(task.dueDate));
    const matches = isSameDay(taskDate, selectedDate);
    if (!matches) {
      console.log(`🔍 Task ${task.title} dueDate ${task.dueDate} doesn't match selected date ${selectedDate.toLocaleDateString('en-CA')}`);
    }
    return matches;
  });

  // Debug: Log task information
  console.log(`🔍 Task Debug - Total tasks: ${globalTasks.length}, Selected date: ${selectedDate.toLocaleDateString('en-CA')}, Tasks for selected date: ${selectedDateTasks.length}`);
  if (globalTasks.length > 0) {
    console.log(`🔍 Task Debug - Available task dates:`, globalTasks.map(t => ({ 
      id: t.id, 
      dueDate: t.dueDate, 
      title: t.title,
      status: t.status 
    })).slice(0, 3));
    
    // Check if any tasks have dueDate
    const tasksWithDueDate = globalTasks.filter(t => t.dueDate);
    console.log(`🔍 Task Debug - Tasks with dueDate: ${tasksWithDueDate.length}/${globalTasks.length}`);
    
    // Check if any tasks match today's date
    const today = new Date().toLocaleDateString('en-CA');
    const tasksForToday = globalTasks.filter(task => {
      if (!task.dueDate) return false;
      const taskDate = startOfDay(new Date(task.dueDate));
      const todayDate = startOfDay(new Date());
      return isSameDay(taskDate, todayDate);
    });
    console.log(`🔍 Task Debug - Tasks for today (${today}): ${tasksForToday.length}`);
  }

  // Compute gaps locally for selected date from tasks and preferences
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedDateGaps = useGaps(selectedDateStr, globalTasks, userPreferences);

  // Phase 2: Device calendar busy → subtract from gaps
  const [deviceBusy, setDeviceBusy] = useState<{ start: number; end: number; title: string; isAllDay?: boolean }[]>([]);

  useEffect(() => {
    const shouldUseDeviceCalendar = !!userPreferences?.show_device_calendar_busy && typeof window !== 'undefined' && (window as any).Capacitor;
    if (!shouldUseDeviceCalendar) {
      setDeviceBusy([]);
      return;
    }

    const fetchBusy = async () => {
      try {
        const start = startOfDay(selectedDate);
        const end = addDays(start, 1);
        let includeIds = userPreferences?.device_calendar_included_ids || [];
        // If not set yet in preferences, try lightweight localStorage fallback to persist across cold starts
        if (!includeIds || includeIds.length === 0) {
          try {
            const userId = session?.user?.id || 'local-user';
            const raw = localStorage.getItem(`gaply_device_calendar_${userId}`);
            if (raw) {
              const fb = JSON.parse(raw || '{}') || {};
              if (Array.isArray(fb.device_calendar_included_ids)) {
                includeIds = fb.device_calendar_included_ids;
              }
            }
          } catch {}
        }
        if (!includeIds || includeIds.length === 0) {
          try {
            const cals = await loadDeviceCalendars();
            includeIds = cals.filter(c => c.type !== 'Subscribed').map(c => c.id);
          } catch {}
        }
        const events = await fetchDeviceWindow(includeIds, start.toISOString(), end.toISOString());
        setDeviceBusy(events.map(e => ({ start: e.start, end: e.end, title: e.title || '' , isAllDay: e.isAllDay })));
      } catch (e) {
        setDeviceBusy([]);
      }
    };
    fetchBusy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStr, userPreferences?.show_device_calendar_busy, JSON.stringify(userPreferences?.device_calendar_included_ids)]);

  const applyDeviceBusyToGaps = (gapsIn: TimeGap[]) => {
    if (!userPreferences?.show_device_calendar_busy || deviceBusy.length === 0) return gapsIn;
    let current = [...gapsIn];
    for (const evt of deviceBusy) {
      try {
        const evtStart = new Date(evt.start);
        const evtEnd = new Date(evt.end);
        // Coerce to selected date window
        const dayStart = startOfDay(selectedDate);
        const dayEnd = addDays(dayStart, 1);
        const s = new Date(Math.max(evtStart.getTime(), dayStart.getTime()));
        const e = new Date(Math.min(evtEnd.getTime(), dayEnd.getTime()));
        if (e <= s) continue;
        const sStr = minutesToTime(s.getHours() * 60 + s.getMinutes());
        const eStr = minutesToTime(e.getHours() * 60 + e.getMinutes());
        const newGaps: TimeGap[] = [];
        for (const gap of current) {
          const gapStartMin = timeToMinutes(gap.start_time);
          const gapEndMin = timeToMinutes(gap.end_time);
          const busyStartMin = timeToMinutes(sStr);
          const busyEndMin = timeToMinutes(eStr);
          if (busyStartMin < gapEndMin && busyEndMin > gapStartMin) {
            const result = GapLogic.scheduleTaskInGap(gap, sStr, eStr, 'calendar_sync');
            if (result.deletedGap) {
              // Gap was completely filled, don't add it back
              continue;
            } else {
              newGaps.push(...result.newGaps);
            }
          } else {
            newGaps.push(gap);
          }
        }
        current = newGaps;
      } catch {}
    }
    return current;
  };

  const adjustedGaps = useMemo(() => applyDeviceBusyToGaps(selectedDateGaps), [selectedDateGaps, deviceBusy, userPreferences?.show_device_calendar_busy]);
  
  // Debug: Log gap information
  console.log(`🔍 Gap Debug - Total gaps: ${gaps.length}, Selected date: ${format(selectedDate, 'yyyy-MM-dd')}, Gaps for selected date: ${selectedDateGaps.length}`);
  if (gaps.length > 0) {
    console.log(`🔍 Gap Debug - Available gap dates:`, gaps.map(g => g.date).slice(0, 5));
  }
  
  // Debug: Log when gaps prop changes
  useEffect(() => {
    console.log(`📊 PlannerContent received ${gaps.length} gaps`);
    if (gaps.length > 0) {
      console.log(`📊 Gap dates:`, gaps.map(g => g.date).slice(0, 3));
    }
  }, [gaps]);

  // Helper function to check if a gap overlaps with working hours
  const isGapWithinWorkingHours = (gap: TimeGap) => {
    if (!userPreferences?.calendar_work_start || !userPreferences?.calendar_work_end) {
      return true; // If no working hours defined, count all gaps
    }
    
    try {
      const gapStart = gap.start_time;
      const gapEnd = gap.end_time;
      
      if (!gapStart || !gapEnd) return false;
      
      // Parse gap times
      let startTime: Date;
      let endTime: Date;
      
      if (gapStart.includes('T')) {
        startTime = new Date(gapStart);
      } else {
        const selectedDateStr = selectedDate.toLocaleDateString('en-CA');
        startTime = new Date(`${selectedDateStr}T${gapStart}`);
      }
      
      if (gapEnd.includes('T')) {
        endTime = new Date(gapEnd);
      } else {
        const selectedDateStr = selectedDate.toLocaleDateString('en-CA');
        endTime = new Date(`${selectedDateStr}T${gapEnd}`);
      }
      
      // Validate duration makes sense
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      if (durationMinutes <= 0 || durationMinutes > 24 * 60) {
        return false; // Skip gaps with invalid durations
      }
      
      const timeFormat = (date: Date) => date.toTimeString().substring(0, 5); // HH:mm format
      const startTimeStr = timeFormat(startTime);
      const endTimeStr = timeFormat(endTime);
      const workStart = userPreferences.calendar_work_start;
      const workEnd = userPreferences.calendar_work_end;
      
      // Check if gap overlaps with working hours (not completely within)
      return startTimeStr < workEnd && endTimeStr > workStart;
    } catch (error) {
      console.warn('Failed to check gap working hours:', error);
      return true; // Include gap if we can't parse times
    }
  };

  // Calculate summary stats - only count gaps within working hours
  const workingHoursGaps = selectedDateGaps.filter(isGapWithinWorkingHours);
  
  // Calculate total remaining time across all gaps within working hours
  const calculateTotalGapTime = () => {
    let totalMinutes = 0;
    
    workingHoursGaps.forEach(gap => {
      try {
        const gapStart = gap.start_time;
        const gapEnd = gap.end_time;
        
        if (!gapStart || !gapEnd) return;
        
        // Parse gap times
        let startTime: Date;
        let endTime: Date;
        
        if (gapStart.includes('T')) {
          startTime = new Date(gapStart);
        } else {
          const selectedDateStr = selectedDate.toLocaleDateString('en-CA');
          startTime = new Date(`${selectedDateStr}T${gapStart}`);
        }
        
        if (gapEnd.includes('T')) {
          endTime = new Date(gapEnd);
        } else {
          const selectedDateStr = selectedDate.toLocaleDateString('en-CA');
          endTime = new Date(`${selectedDateStr}T${gapEnd}`);
        }
        
        const isTodaySelected = isSameDay(selectedDate, currentTime);
        if (isTodaySelected) {
          // Only count time from now forward
          if (endTime <= currentTime) {
            return; // past gap, contributes 0
          }
          const effectiveStart = currentTime > startTime ? currentTime : startTime;
          const durationMinutes = Math.round((endTime.getTime() - effectiveStart.getTime()) / (1000 * 60));
          if (durationMinutes > 0 && durationMinutes <= 24 * 60) {
            totalMinutes += durationMinutes;
          }
        } else {
          // Non-today: count full gap durations
          const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
          if (durationMinutes > 0 && durationMinutes <= 24 * 60) {
            totalMinutes += durationMinutes;
          }
        }
      } catch (error) {
        console.warn('Error calculating gap duration:', error);
      }
    });
    
    return totalMinutes;
  };

  const totalGapMinutes = calculateTotalGapTime();
  const totalGapHours = Math.floor(totalGapMinutes / 60);
  const remainingMinutes = totalGapMinutes % 60;
  
  const formatGapTime = () => {
    if (totalGapMinutes === 0) return '';
    
    if (totalGapHours > 0) {
      return remainingMinutes > 0 
        ? `${totalGapHours}h ${remainingMinutes}m` 
        : `${totalGapHours}h`;
    } else {
      return `${remainingMinutes}m`;
    }
  };
  
  const scheduledActivitiesCount = useMemo(() => {
    const selStr = format(selectedDate, 'yyyy-MM-dd');
    let count = 0;
    for (const t of globalTasks) {
      if (!t.dueDate) continue;
      try {
        if (t.dueDate === selStr) { count++; continue; }
        const taskDate = new Date(t.dueDate);
        if (isSameDay(taskDate, selectedDate)) { count++; continue; }
      } catch {
        const d = String(t.dueDate).split('T')[0];
        if (d === selStr) { count++; }
      }
    }
    return count;
  }, [globalTasks, selectedDate]);
  const gapTimeText = formatGapTime();
  
  // Ref for timeline container to auto-scroll to current time
  const timelineRef = useRef<HTMLDivElement>(null);

  // Function to scroll to current time
  const scrollToCurrentTime = () => {
    if (timelineRef.current && isSameDay(selectedDate, new Date())) {
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      
      // Get working hours for more accurate calculation
      const workStartHour = userPreferences?.calendar_work_start 
        ? parseInt(userPreferences.calendar_work_start.split(':')[0]) 
        : 9;
      
      // Calculate scroll position to show current time at the top
      const timeSlotHeight = 140; // Approximate height of each time slot with items
      const currentTimeOffset = (currentHour - workStartHour) * timeSlotHeight + (currentMinute / 60) * timeSlotHeight;
      
      // Position current time at the top with some padding
      const scrollTop = Math.max(0, currentTimeOffset - 120); // More padding from top
      
      // Smooth scroll to current time
      timelineRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll to current time when component mounts or date changes to today
  useEffect(() => {
    // Small delay to ensure timeline is rendered
    const timer = setTimeout(() => {
      scrollToCurrentTime();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [selectedDate, userPreferences?.calendar_work_start]);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 px-6 pt-2 pb-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-semibold mb-2 text-white">
            Planner
          </h1>
          <p className="text-slate-400 text-base">
            {`${scheduledActivitiesCount} ${scheduledActivitiesCount === 1 ? 'activity' : 'activities'}`}
            {gapTimeText && (
              <span> • {gapTimeText} left</span>
            )}
          </p>
        </div>

        {/* Date Navigation with integrated Now button */}
        <div className="relative mb-2">
          {/* Left scroll indicator */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-slate-400 opacity-60" />
          </div>
          
          {/* Right scroll indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-slate-400 opacity-60" />
          </div>
          
          {/* If no working days selected, show empty state instead of tabs */}
          {workingDays.length === 0 ? (
            <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
              <div className="text-slate-300 text-sm">
                No working days selected. Set them in Settings to generate planner gaps.
              </div>
              <button
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent('navigateTo', { detail: { tab: 'settings' } }));
                  } catch {}
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium"
                type="button"
              >
                Open Settings
              </button>
            </div>
          ) : (
          <div
            className="flex items-center gap-3 overflow-x-auto ios-scroll android-scroll pb-4 px-8" 
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              scrollSnapType: 'x mandatory'
            }}
            ref={(el) => {
              // Auto-scroll to today on mount
              if (el && !el.dataset.scrolled) {
                const today = startOfDay(new Date());
                const index = dateTabs.findIndex(tab => isSameDay(tab.date, today));
                const targetChild = index >= 0 ? (el.children[index] as HTMLElement) : (el.children[0] as HTMLElement);
                if (targetChild) {
                  const containerWidth = el.offsetWidth;
                  const buttonWidth = targetChild.offsetWidth;
                  const scrollLeft = targetChild.offsetLeft - (containerWidth / 2) + (buttonWidth / 2);
                  el.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
                }
                el.dataset.scrolled = 'true';
              }
            }}
          >
            {dateTabs.map((tab) => (
              <button
                key={tab.date.toISOString()}
                onClick={() => setSelectedDate(tab.date)}
                className={`
                  px-4 py-2 rounded-2xl transition-all whitespace-nowrap text-sm font-medium min-w-fit touch-manipulation flex-shrink-0
                  ${isSameDay(selectedDate, tab.date)
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 active:bg-slate-600/50'
                  }
                  ${tab.isToday ? 'ring-2 ring-blue-400/30' : ''}
                `}
                style={{ scrollSnapAlign: 'center' }}
                type="button"
              >
                {tab.label}
              </button>
            ))}
            
            {/* Now button integrated into the date navigation */}
            <button
              onClick={() => {
                if (workingDays.length === 0) {
                  try {
                    window.dispatchEvent(new CustomEvent('navigateTo', { detail: { tab: 'settings' } }));
                  } catch {}
                  return;
                }
                const today = startOfDay(new Date());
                const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
                let targetDate = today;
                if (!workingDays.includes(todayName)) {
                  // Find the next working day within the window
                  const future = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
                  const next = future.find(d => workingDays.includes(d.toLocaleDateString('en-US', { weekday: 'long' })));
                  if (next) {
                    targetDate = startOfDay(next);
                  } else if (dateTabs.length > 0) {
                    targetDate = dateTabs[0].date;
                  }
                }
                setSelectedDate(targetDate);
                setTimeout(scrollToCurrentTime, 150);
              }}
              className="px-3 py-2 bg-slate-700/30 hover:bg-slate-600/30 text-slate-300 hover:text-white rounded-2xl transition-all whitespace-nowrap text-sm font-medium min-w-fit touch-manipulation flex-shrink-0 border border-slate-600/30 hover:border-slate-500/50"
              type="button"
              title="Jump to today and current time"
            >
              Now
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Scrollable Timeline Section */}
      <div 
        ref={timelineRef}
        className="flex-1 overflow-y-auto ios-scroll android-scroll no-bounce px-6 pt-2" 
        data-scrollable="true"
      >
        <PlannerTimeline
          tasks={selectedDateTasks}
          gaps={adjustedGaps}
          selectedDate={selectedDate}
          currentTime={currentTime}
          onTaskOpen={onTaskOpen}
          onTaskEdit={onTaskEdit}
          onGapUtilize={onGapUtilize}
          userPreferences={userPreferences}
          isWorkingDay={isSelectedDateWorkingDay}
          hasWorkingDays={workingDays.length > 0}
        />
      </div>
    </div>
  );
}

export { PlannerContent };