import { useState, useMemo, useEffect, useRef } from 'react';
import { format, parseISO, addMinutes, isSameDay, isValid as isValidDate } from 'date-fns';
import { Clock, User, Briefcase, Heart, Brain, Coffee, Moon, Target, Calendar, Settings, Sparkles } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon } from '../utils/helpers';
import { ActivityStackModal } from './ActivityStackModal';
import { OverlapModal } from './OverlapModal';
import { CalendarEventModal } from './CalendarEventModal';
import { calendarService } from '../utils/calendar/index';

interface TimelineItem {
  id: string;
  type: 'task' | 'gap' | 'calendar';
  startTime: Date;
  endTime: Date;
  title: string;
  duration: string;
  category?: string;
  icon: React.ReactNode;
  iconColor: string;
  data: Task | TimeGap | any; // calendar events will be any type for now
  gapSource?: 'default' | 'calendar' | 'manual';
}

interface PlannerTimelineProps {
  tasks: Task[];
  gaps: TimeGap[];
  selectedDate: Date;
  currentTime: Date;
  onTaskOpen: (task: Task) => void;
  onTaskEdit?: (task: Task) => void;
  onGapUtilize: (gap: TimeGap) => void;
  userPreferences?: UserPreferences;
  isWorkingDay?: boolean;
  hasWorkingDays?: boolean;
  calendarEvents?: Array<{ id: string; start: Date; end: Date; title: string | undefined; isAllDay: boolean }>;
}

function PlannerTimeline({ 
  tasks, 
  gaps, 
  selectedDate, 
  currentTime,
  onTaskOpen, 
  onTaskEdit,
  onGapUtilize,
  userPreferences,
  isWorkingDay = true,
  hasWorkingDays = true,
  calendarEvents = []
}: PlannerTimelineProps) {
  
  // Ref for the timeline container to enable auto-scrolling
  const timelineRef = useRef<HTMLDivElement>(null);
  const [busyOverlays, setBusyOverlays] = useState<{ start: Date; end: Date }[]>([]);

  // Load busy overlays for selected date when preference enabled
  useEffect(() => {
    const loadBusy = async () => {
      try {
        if (!userPreferences?.show_device_calendar_busy) { setBusyOverlays([]); return; }
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const blocks = await calendarService.getBusyBlocks({ start: dateStr, end: dateStr }, userPreferences);
        const mapped = (blocks || [])
          .filter(b => b.date === dateStr)
          .map(b => ({ start: parseISO(`${b.date}T${b.start_time}`), end: parseISO(`${b.date}T${b.end_time}`) }));
        setBusyOverlays(mapped);
      } catch {
        setBusyOverlays([]);
      }
    };
    void loadBusy();
  }, [selectedDate, userPreferences?.show_device_calendar_busy]);
  
  // Stacking modal state (overlaps only)
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Task[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  
  // New modal state for mixed calendar/task overlaps
  const [overlapModalOpen, setOverlapModalOpen] = useState(false);
  const [selectedOverlap, setSelectedOverlap] = useState<{
    tasks: Task[];
    calendarEvents: Array<{ id: string; start: Date; end: Date; title: string | undefined; isAllDay: boolean }>;
    timeSlot: string;
    hasCalendarEvents: boolean;
  } | null>(null);
  
  // Calendar event modal state
  const [calendarEventModalOpen, setCalendarEventModalOpen] = useState(false);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<any>(null);
  
  // Helper function to check if a gap overlaps with working hours
  const isGapWithinWorkingHours = (startTime: Date, endTime: Date) => {
    if (!userPreferences?.calendar_work_start || !userPreferences?.calendar_work_end) {
      return true; // If no working hours defined, show all gaps
    }
    
    const startTimeStr = format(startTime, 'HH:mm');
    const endTimeStr = format(endTime, 'HH:mm');
    const workStart = userPreferences.calendar_work_start;
    const workEnd = userPreferences.calendar_work_end;
    
    // Check if gap overlaps with working hours (not completely within)
    return startTimeStr < workEnd && endTimeStr > workStart;
  };

  // Get gap source icon and color
  const getGapSourceInfo = (gap: TimeGap) => {
    // In new architecture, all gaps are treated equally
    // We can use the modified_by field to determine the source
    const source = gap.modified_by;
    
    switch (source) {
      case 'calendar_sync':
        return {
          icon: <Calendar className="w-4 h-4 text-blue-400" />,
          color: 'bg-blue-500/20',
          borderColor: 'border-blue-500/30',
          label: 'Calendar'
        };
      case 'user':
        return {
          icon: <Settings className="w-4 h-4 text-purple-400" />,
          color: 'bg-purple-500/20',
          borderColor: 'border-purple-500/30',
          label: 'Manual'
        };
      case 'system':
      default:
        return {
          icon: <Sparkles className="w-4 h-4 text-green-400" />,
          color: 'bg-green-500/20',
          borderColor: 'border-green-500/30',
          label: 'AI Generated'
        };
    }
  };

  // Convert tasks and gaps to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    
    // Debug: Log gaps being processed
    console.log(`🔍 PlannerTimeline Debug - Processing ${gaps.length} gaps for date: ${format(selectedDate, 'yyyy-MM-dd')}`);
    if (gaps.length > 0) {
      console.log(`🔍 PlannerTimeline Debug - Gap dates:`, gaps.map(g => g.date).slice(0, 5));
    }
    
    // Get working hours for filtering
    const workStartHour = userPreferences?.calendar_work_start 
      ? parseInt(userPreferences.calendar_work_start.split(':')[0]) 
      : 9;
    const workEndHour = userPreferences?.calendar_work_end 
      ? parseInt(userPreferences.calendar_work_end.split(':')[0]) 
      : 17;
    
    // Filter gaps for the selected date
    const selectedDateGaps = gaps.filter(gap => {
      if (!gap.date) return false;
      const gapDate = new Date(gap.date);
      return isSameDay(gapDate, selectedDate);
    });
    
    console.log(`🔍 PlannerTimeline Debug - Found ${selectedDateGaps.length} gaps for selected date`);
    
    // Add gaps to timeline items
    selectedDateGaps.forEach(gap => {
      try {
        const startTime = parseISO(`${gap.date}T${gap.start_time}`);
        const endTime = parseISO(`${gap.date}T${gap.end_time}`);
        
        // Only add gaps within working hours
        if (isGapWithinWorkingHours(startTime, endTime)) {
          const gapSourceInfo = getGapSourceInfo(gap);
          // Dynamic remaining duration when currently inside gap (only for today)
          const isTodaySelected = isSameDay(selectedDate, currentTime);
          const nowInGap = isTodaySelected && currentTime >= startTime && currentTime < endTime;
          const dynamicMinutesLeft = nowInGap
            ? Math.max(0, Math.round((endTime.getTime() - currentTime.getTime()) / (1000 * 60)))
            : gap.duration_minutes;
          
          items.push({
            id: gap.id,
            type: 'gap',
            startTime,
            endTime,
            title: `Gap`,
            duration: `${dynamicMinutesLeft} min`,
            icon: gapSourceInfo.icon,
            iconColor: gapSourceInfo.color,
            data: gap,
            gapSource: gap.modified_by as 'default' | 'calendar' | 'manual'
          });
          
          console.log(`✅ Added gap to timeline: ${gap.start_time}-${gap.end_time} (${gap.duration_minutes} min)`);
        } else {
          console.log(`⏭️ Skipped gap outside working hours: ${gap.start_time}-${gap.end_time}`);
        }
      } catch (error) {
        console.error(`❌ Error processing gap ${gap.id}:`, error);
      }
    });
    
    // Add calendar events as timeline items
    if (userPreferences?.show_device_calendar_busy) {
      console.log(`🔧 Timeline Debug - Calendar events prop:`, calendarEvents);
      console.log(`🔧 Timeline Debug - Selected date:`, selectedDate.toISOString());
      
      // Combine both sources: direct prop events and busy overlays as fallback
      const candidates: Array<{ id: string; start: Date; end: Date; title: string }>= [];
      if (calendarEvents && calendarEvents.length > 0) {
        console.log(`🔧 Timeline Debug - Processing ${calendarEvents.length} calendar events from prop`);
        for (const ev of calendarEvents) {
          candidates.push({ id: ev.id, start: ev.start, end: ev.end, title: ev.title || '' });
        }
      }
      if (busyOverlays && busyOverlays.length > 0) {
        console.log(`🔧 Timeline Debug - Processing ${busyOverlays.length} busy overlays`);
        for (let i = 0; i < busyOverlays.length; i++) {
          const ov = busyOverlays[i];
          candidates.push({ id: `busy-overlay-${i}`, start: ov.start, end: ov.end, title: '' });
        }
      }
      
      console.log(`🔧 Timeline Debug - Total candidates:`, candidates.length);

      // Remove time-based deduplication to allow overlapping events with same times
      const filtered = candidates;

      if (filtered.length > 0) {
        console.log(`🔍 Timeline Debug - Processing ${filtered.length} calendar events (combined sources)`);
      }

      filtered.forEach((event) => {
        try {
          // Only include events on the selected date (overlap)
          const dayStart = new Date(selectedDate); dayStart.setHours(0,0,0,0);
          const dayEnd = new Date(selectedDate); dayEnd.setHours(23,59,59,999);
          
          console.log(`🔧 Timeline Debug - Event "${event.title}": ${event.start.toISOString()} to ${event.end.toISOString()}`);
          console.log(`🔧 Timeline Debug - Day range: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
          console.log(`🔧 Timeline Debug - Overlap check: start <= dayEnd? ${event.start <= dayEnd}, end >= dayStart? ${event.end >= dayStart}`);
          
          if (!(event.start <= dayEnd && event.end >= dayStart)) {
            console.log(`🔧 Timeline Debug - Event filtered out due to date range`);
            return;
          }
          
          console.log(`🔧 Timeline Debug - Event "${event.title}" passed date filter`);
          // Split into per-hour segments to avoid cross-slot rendering issues
          const segmentStart = event.start < dayStart ? dayStart : event.start;
          const segmentEnd = event.end > dayEnd ? dayEnd : event.end;
          const startHour = new Date(segmentStart).getHours();
          const endHourExclusive = new Date(segmentEnd).getHours() + (new Date(segmentEnd).getMinutes() > 0 || new Date(segmentEnd).getSeconds() > 0 ? 1 : 0);
          for (let hour = startHour; hour < Math.max(startHour + 1, endHourExclusive); hour++) {
            const hourStart = new Date(selectedDate); hourStart.setHours(hour, 0, 0, 0);
            const hourEnd = new Date(selectedDate); hourEnd.setHours(hour + 1, 0, 0, 0);
            const segStart = segmentStart > hourStart ? segmentStart : hourStart;
            const segEnd = segmentEnd < hourEnd ? segmentEnd : hourEnd;
            if (!isValidDate(segStart) || !isValidDate(segEnd)) {
              continue;
            }
            if (segEnd <= segStart) continue;
            const durationMinutes = Math.max(0, Math.round((segEnd.getTime() - segStart.getTime()) / (1000 * 60)));
            items.push({
              id: `cal-${event.id}-${hour}`,
              type: 'calendar',
              startTime: segStart,
              endTime: segEnd,
              title: event.title || 'Busy',
              duration: `${durationMinutes} min`,
              icon: <Calendar className="w-4 h-4 text-red-400" />,
              iconColor: 'bg-red-500/20',
                      data: {
          id: event.id,
          start: segStart,
          end: segEnd,
          title: event.title || '',
          isAllDay: event.isAllDay || false,
          // Pass through basic event details for the modal
          calendarId: event.calendarId,
          location: event.location,
          notes: event.notes,
          url: event.url,
          transparency: event.transparency,
          status: event.status
        },
              gapSource: 'calendar'
            });
            console.log(`✅ Added calendar segment: ${format(segStart, 'HH:mm')}-${format(segEnd, 'HH:mm')} (${durationMinutes} min)`);
          }
        } catch (error) {
          console.error(`❌ Error processing calendar event:`, error);
        }
      });
    }

    // Add tasks
    tasks.forEach(task => {
      if (!task.dueDate) return;
      
      const startTime = task.dueTime 
        ? parseISO(`${task.dueDate}T${task.dueTime}`)
        : parseISO(`${task.dueDate}T09:00:00`);
      
      // Only include tasks within working hours
      const taskHour = startTime.getHours();
      if (taskHour < workStartHour || taskHour >= workEndHour) {
        return;
      }
      
      // Parse duration more carefully - handle MM:SS, HH:MM:SS, or "30 min" formats
      let durationMinutes = 30; // default
      if (task.duration) {
        if (task.duration.includes(':')) {
          const parts = task.duration.split(':');
          if (parts.length >= 2) {
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            durationMinutes = (hours * 60) + minutes;
          }
        } else {
          // Handle "30 min" format
          const match = task.duration.match(/(\d+)/);
          if (match) {
            durationMinutes = parseInt(match[1]);
          }
        }
      }
      
      const endTime = addMinutes(startTime, durationMinutes);
      
      // Get category-based icon and color
      const getCategoryIcon = (category: string) => {
        switch (category.toLowerCase()) {
          case 'work':
          case 'focus work':
            return { icon: <Briefcase className="w-4 h-4" />, color: 'bg-blue-500' };
          case 'meeting':
          case 'team meeting':
            return { icon: <User className="w-4 h-4" />, color: 'bg-blue-600' };
          case 'wellness':
          case 'deep breathing':
            return { icon: <Heart className="w-4 h-4" />, color: 'bg-pink-500' };
          case 'learning':
            return { icon: <Brain className="w-4 h-4" />, color: 'bg-purple-500' };
          case 'break':
            return { icon: <Coffee className="w-4 h-4" />, color: 'bg-orange-500' };
          case 'personal':
            return { icon: <Moon className="w-4 h-4" />, color: 'bg-indigo-500' };
          default:
            return { icon: <Target className="w-4 h-4" />, color: 'bg-slate-500' };
        }
      };
      
      const categoryInfo = getCategoryIcon(task.category);
      
      items.push({
        id: task.id,
        type: 'task',
        startTime,
        endTime,
        title: task.title,
        duration: task.duration,
        category: task.category,
        icon: categoryInfo.icon,
        iconColor: categoryInfo.color,
        data: task
      });
    });
    
    // Sort by start time
    const sortedItems = items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    // Debug: Log final timeline items
    const gapItems = sortedItems.filter(item => item.type === 'gap');
    console.log(`🔍 PlannerTimeline Debug - Final timeline items: ${sortedItems.length} total, ${gapItems.length} gaps`);
    
    return sortedItems;
  }, [tasks, gaps, selectedDate, userPreferences, currentTime, calendarEvents, busyOverlays]);
  
  // Generate time slots for the day based on user's working hours
  const generateTimeSlots = () => {
    const slots = [];
    const is24Hour = userPreferences?.time_format === '24h';

    // Always use user's working hours - no fallback to defaults
    if (!userPreferences?.calendar_work_start || !userPreferences?.calendar_work_end) {
      console.warn('⚠️ No working hours set in preferences, cannot generate time slots');
      return [];
    }
    
    const startHour = parseInt(userPreferences.calendar_work_start.split(':')[0]);
    let endHour = parseInt(userPreferences.calendar_work_end.split(':')[0]);
    
    // Ensure end hour is after start hour (handle overnight shifts)
    if (endHour <= startHour) {
      console.warn('⚠️ End hour is before start hour, extending to end of day');
      endHour = 23; // If end is before start, extend to end of day
    }

    // Show hour slots from start up to the last starting hour
    // Example: 06:00–16:00 workday → slots: 06,07,...,15; last gap (15:00–16:00) renders inside 15:00 slot
    for (let hour = startHour; hour < endHour; hour++) {
      const timeString = `${hour.toString().padStart(2, '0')}:00`;
      let displayTime;

      if (is24Hour) {
        displayTime = timeString;
      } else {
        if (hour === 0) {
          displayTime = '12:00 AM';
        } else if (hour < 12) {
          displayTime = `${hour}:00 AM`;
        } else if (hour === 12) {
          displayTime = '12:00 PM';
        } else {
          displayTime = `${hour - 12}:00 PM`;
        }
      }

      slots.push({
        time: timeString,
        hour24: hour,
        display: displayTime
      });
    }
    return slots;
  };
  
  const timeSlots = hasWorkingDays && isWorkingDay ? generateTimeSlots() : [];
  
  // Check if current time should be shown (only for today)
  const shouldShowCurrentTime = isSameDay(selectedDate, currentTime);
  const currentHour = currentTime.getHours();
  // const currentMinute = currentTime.getMinutes();
  
  // Auto-scroll to current time when viewing today
  useEffect(() => {
    if (!timelineRef.current || !shouldShowCurrentTime || !isWorkingDay || !hasWorkingDays) return;
    
    // Find the current hour element
    const currentHourIndex = timeSlots.findIndex(slot => slot.hour24 === currentHour);
    if (currentHourIndex === -1) return;
    
    // Calculate target scroll position to center the current time
    const timelineElement = timelineRef.current;
    const timelineHeight = timelineElement.clientHeight;
    const targetScrollTop = (currentHourIndex * 100) - (timelineHeight / 2);
    
    // Smooth scroll to the current time
    timelineElement.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
    
    console.log(`📍 Auto-scrolled timeline to current hour: ${currentHour}:00`);
  }, [selectedDate, currentHour, shouldShowCurrentTime, timeSlots]);
  
  // Simple function to get items for each time slot
  const getItemsForHour = (hour: number) => {
    const hourStart = new Date(selectedDate); hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(selectedDate); hourEnd.setHours(hour + 1, 0, 0, 0);
    return timelineItems.filter(item => item.startTime < hourEnd && item.endTime > hourStart);
  };
  
  // Group overlapping tasks and calendar events among a set of timeline items
  const groupOverlappingItems = (items: TimelineItem[]) => {
    // Separate tasks and calendar events, but process them together for overlapping detection
    const allItems = items
      .filter((it) => it.type === 'task' || it.type === 'calendar')
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const groups: { items: TimelineItem[]; startTime: Date; endTime: Date; hasCalendarEvents: boolean }[] = [];
    let currentGroup: TimelineItem[] = [];
    let currentGroupEnd: Date | null = null;

    for (const item of allItems) {
      if (currentGroup.length === 0) {
        currentGroup = [item];
        currentGroupEnd = item.endTime;
      } else {
        if (item.startTime < (currentGroupEnd as Date)) {
          currentGroup.push(item);
          // Extend end if needed
          if (item.endTime > (currentGroupEnd as Date)) {
            currentGroupEnd = item.endTime;
          }
        } else {
          groups.push({
            items: currentGroup,
            startTime: currentGroup[0].startTime,
            endTime: currentGroupEnd as Date,
            hasCalendarEvents: currentGroup.some(it => it.type === 'calendar')
          });
          currentGroup = [item];
          currentGroupEnd = item.endTime;
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push({
        items: currentGroup,
        startTime: currentGroup[0].startTime,
        endTime: currentGroupEnd as Date,
        hasCalendarEvents: currentGroup.some(it => it.type === 'calendar')
      });
    }

    return groups;
  };
  
  const formatTimeRange = (startTime: Date, endTime: Date) => {
    const is24Hour = userPreferences?.time_format === '24h';
    const timeFormat = is24Hour ? 'HH:mm' : 'h:mm a';
    if (!startTime || !endTime || !isValidDate(startTime) || !isValidDate(endTime)) {
      return '--';
    }
    const start = format(startTime, timeFormat);
    const end = format(endTime, timeFormat);
    return `${start} - ${end}`;
  };
  
  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'task') {
      onTaskOpen(item.data as Task);
    } else if (item.type === 'gap') {
      onGapUtilize(item.data as TimeGap);
    } else if (item.type === 'calendar') {
      // Open calendar event modal
      setSelectedCalendarEvent({
        id: item.data.id || item.id,
        calendarId: item.data.calendarId || 'default',
        title: item.data.title || 'Busy',
        start: item.startTime.getTime(),
        end: item.endTime.getTime(),
        isAllDay: item.data.isAllDay || false,
        organizer: item.data.organizer,
        attendees: item.data.attendees,
        location: item.data.location,
        notes: item.data.description || item.data.notes,
        url: item.data.url,
        transparency: item.data.transparency,
        status: item.data.status,
        recurrenceRules: item.data.recurrenceRules,
        lastModifiedDate: item.data.lastModifiedDate,
        creationDate: item.data.creationDate,
        conferenceData: item.data.conferenceData
      });
      setCalendarEventModalOpen(true);
    }
  };

  return (
    <>
    <div ref={timelineRef} className="space-y-4 pb-8 relative">
      {!hasWorkingDays && (
        <div className="text-center py-8 bg-slate-800/30 border border-slate-700/30 rounded-2xl">
          <h3 className="text-slate-200 font-medium mb-1">No working days selected</h3>
          <p className="text-slate-400 text-sm">Set your working days in Settings to generate planner gaps.</p>
        </div>
      )}
      {hasWorkingDays && !isWorkingDay && (
        <div className="text-center py-6 bg-slate-800/20 border border-slate-700/20 rounded-2xl">
          <p className="text-slate-400 text-sm">This date isn’t a working day. Select a working day to see gaps.</p>
        </div>
      )}
      {hasWorkingDays && isWorkingDay && timeSlots.length === 0 && (
        <div className="text-center py-6 text-slate-400">No time slots available.</div>
      )}
      {timeSlots.map((slot) => {
        const itemsAtHour = getItemsForHour(slot.hour24);

        // Build render units: gaps as-is, tasks and calendar events grouped by overlap
        type RenderUnit = 
          | { kind: 'gap'; item: TimelineItem }
          | { kind: 'taskGroup'; items: TimelineItem[]; startTime: Date; endTime: Date; hasCalendarEvents: boolean };

        const gapUnits: RenderUnit[] = itemsAtHour
          .filter((it) => it.type === 'gap')
          .map((gap) => ({ kind: 'gap', item: gap }));

        const taskGroups = groupOverlappingItems(itemsAtHour);
        console.log(`🔧 Timeline Debug - Hour ${slot.hour24}: ${itemsAtHour.length} items, ${taskGroups.length} groups`);
        if (itemsAtHour.length > 0) {
          console.log(`🔧 Timeline Debug - Items for hour ${slot.hour24}:`, itemsAtHour.map(i => `${i.type}:${i.title}(${format(i.startTime, 'HH:mm')}-${format(i.endTime, 'HH:mm')})`));
        }
        if (taskGroups.length > 0) {
          console.log(`🔧 Timeline Debug - Task groups for hour ${slot.hour24}:`, taskGroups.map(g => `${g.items.length} items (hasCalendar: ${g.hasCalendarEvents})`));
        }
        
        const groupUnits: RenderUnit[] = taskGroups.map((g) => ({
          kind: 'taskGroup',
          items: g.items,
          startTime: g.startTime,
          endTime: g.endTime,
          hasCalendarEvents: g.hasCalendarEvents
        }));

        const renderUnits: RenderUnit[] = [...gapUnits, ...groupUnits].sort(
          (a, b) => {
            const aTime = a.kind === 'gap' ? a.item.startTime.getTime() : a.startTime.getTime();
            const bTime = b.kind === 'gap' ? b.item.startTime.getTime() : b.startTime.getTime();
            return aTime - bTime;
          }
        );

        return (
          <div key={slot.time} className="flex items-start gap-4 relative">
            {/* Time label */}
            <div className="w-16 flex-shrink-0 text-slate-400 text-xs font-medium pt-2">
              {slot.display}
            </div>
            
            {/* Current time marker - just the line */}
            {shouldShowCurrentTime && slot.hour24 === currentHour && (
              <div className="absolute left-20 top-0 bottom-0 w-0.5 bg-red-500 z-10" />
            )}
            {/* Busy overlay marker for this hour */}
            {userPreferences?.show_device_calendar_busy && (
              (() => {
                const hourStart = new Date(selectedDate); hourStart.setHours(slot.hour24, 0, 0, 0);
                const hourEnd = new Date(selectedDate); hourEnd.setHours(slot.hour24 + 1, 0, 0, 0);
                const hasBusy = busyOverlays.some(b => b.start < hourEnd && b.end > hourStart);
                return hasBusy ? (
                  <div className="absolute left-20 right-4 h-1 top-1 rounded-full bg-red-500/25" />
                ) : null;
              })()
            )}
            
            {/* Timeline items */}
            <div className="flex-1 space-y-3">
              {renderUnits.length > 0 ? (
                renderUnits.map((unit) => {
                  if (unit.kind === 'gap') {
                    const item = unit.item;
                    
                    // Handle regular gaps
                    const gapSourceInfo = getGapSourceInfo(item.data as TimeGap);
                    return (
                      <button
                        key={`${item.type}-${item.id}-${item.startTime.getTime()}-${slot.hour24}`}
                        onClick={() => handleItemClick(item)}
                        className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation bg-slate-800/30 hover:bg-slate-800/50 border ${gapSourceInfo?.borderColor || 'border-slate-700/20'} hover:border-slate-600/40`}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className={`w-10 h-10 ${gapSourceInfo.color} rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                          >
                            {gapSourceInfo.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="text-white font-medium truncate text-base">Gap</h3>
                              <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded-full">
                                {gapSourceInfo.label}
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm text-slate-400">
                              {(() => {
                                // Dynamic display range for current hour when inside the gap and viewing today
                                const isTodaySelected = isSameDay(selectedDate, currentTime);
                                const nowInGap = isTodaySelected && currentTime >= item.startTime && currentTime < item.endTime;
                                let displayStart = item.startTime;
                                let displayEnd = item.endTime;
                                let minutesLeftInHour: number | null = null;
                                if (nowInGap) {
                                  const hourStart = new Date(currentTime);
                                  hourStart.setMinutes(0, 0, 0);
                                  const hourEnd = new Date(hourStart);
                                  hourEnd.setHours(hourStart.getHours() + 1);
                                  displayStart = currentTime > item.startTime ? currentTime : item.startTime;
                                  displayEnd = item.endTime < hourEnd ? item.endTime : hourEnd;
                                  // Calculate minutes left in the current gap, not the entire hour
                                  minutesLeftInHour = Math.max(0, Math.round((item.endTime.getTime() - currentTime.getTime()) / (1000 * 60)));
                                }
                                return (
                                  <>
                                    <span className="font-medium">
                                      {formatTimeRange(displayStart, displayEnd)}
                                    </span>
                                    {minutesLeftInHour !== null && (
                                      <span className="text-xs text-slate-500 sm:ml-2">{`${minutesLeftInHour} Minutes Left In Current Hour`}</span>
                                    )}
                                    {userPreferences?.show_duration_in_planner && minutesLeftInHour === null && (
                                      <span className="text-xs text-slate-500 sm:ml-2">{item.duration}</span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }

                  // taskGroup unit
                  const items = unit.items;
                  const startTime = unit.startTime;
                  const endTime = unit.endTime;

                  if (items.length === 1) {
                    const item = items[0];
                    
                    if (item.type === 'calendar') {
                      // Render single calendar event
                      if (!isValidDate(item.startTime) || !isValidDate(item.endTime)) {
                        return null;
                      }
                      return (
                        <button
                          key={`calendar-${item.id}-${item.startTime.getTime()}-${slot.hour24}`}
                          onClick={() => handleItemClick(item)}
                          className="w-full backdrop-blur-sm rounded-2xl p-4 bg-red-800/30 border border-red-600/40 hover:bg-red-800/50 transition-all duration-200 active:scale-[0.98] touch-manipulation"
                          type="button"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-4 h-4 text-red-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="text-white font-medium truncate text-base">{item.title || 'Busy'}</h3>
                                <span className="text-xs text-red-400 bg-red-700/50 px-2 py-1 rounded-full">
                                  Calendar
                                </span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm text-slate-400">
                                {(() => {
                                  // Clip display to the current hour slot for multi-hour events
                                  const hourStart = new Date(selectedDate); hourStart.setHours(slot.hour24, 0, 0, 0);
                                  const hourEnd = new Date(selectedDate); hourEnd.setHours(slot.hour24 + 1, 0, 0, 0);
                                  const displayStart = item.startTime > hourStart ? item.startTime : hourStart;
                                  const displayEnd = item.endTime < hourEnd ? item.endTime : hourEnd;
                                  if (!isValidDate(displayStart) || !isValidDate(displayEnd)) {
                                    return <span className="font-medium">--</span>;
                                  }
                                  return (
                                    <span className="font-medium">{formatTimeRange(displayStart, displayEnd)}</span>
                                  );
                                })()}
                                {userPreferences?.show_duration_in_planner && (
                                  <span className="text-xs text-slate-500 sm:ml-2">{item.duration}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    } else {
                      // Render single task
                      return (
                        <button
                          key={`task-${item.id}-${item.startTime.getTime()}`}
                          onClick={() => handleItemClick(item)}
                          className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 hover:border-slate-600/50`}
                          type="button"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-10 h-10 ${item.iconColor} rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                            >
                              {renderSafeIcon(item.icon)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="text-white font-medium truncate text-base">{item.title}</h3>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-400">
                                <span className="truncate font-medium">{formatTimeRange(item.startTime, item.endTime)}</span>
                                {userPreferences?.show_duration_in_planner && (
                                  <>
                                    <span>•</span>
                                    <span>{item.duration}</span>
                                  </>
                                )}
                                {item.category && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate">{item.category}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    }
                  }

                  // Stack button for overlapping tasks and calendar events
                  return (
                    <button
                      key={`stack-${slot.hour24}-${startTime.getTime()}`}
                      onClick={() => {
                        // Separate tasks and calendar events for the modal
                        const tasks = items.filter(t => t.type === 'task').map(t => t.data as Task);
                        const calendarEvents = items.filter(t => t.type === 'calendar').map(t => t.data);
                        
                        if (unit.hasCalendarEvents) {
                          // Use the new overlap modal for mixed content
                          setSelectedOverlap({
                            tasks,
                            calendarEvents,
                            timeSlot: formatTimeRange(startTime, endTime),
                            hasCalendarEvents: true
                          });
                          setOverlapModalOpen(true);
                        } else {
                          // Use existing modal for tasks only
                          setSelectedStack(tasks);
                          setSelectedTimeSlot(formatTimeRange(startTime, endTime));
                          setStackModalOpen(true);
                        }
                      }}
                      className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation ${
                        unit.hasCalendarEvents 
                          ? 'bg-red-800/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-500/50' 
                          : 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 hover:border-amber-500/50'
                      }`}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${
                          unit.hasCalendarEvents 
                            ? 'bg-red-500/20 group-hover:scale-110' 
                            : 'bg-amber-500/20 group-hover:scale-110'
                        } rounded-full flex items-center justify-center flex-shrink-0 transition-transform`}>
                          {unit.hasCalendarEvents ? (
                            <Calendar className="w-4 h-4 text-red-400" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-white font-medium truncate text-base">
                              {unit.hasCalendarEvents 
                                ? `${items.length} overlapping events` 
                                : `${items.length} overlapping activities`
                              }
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-slate-400">
                            <span className="font-medium">{formatTimeRange(startTime, endTime)}</span>
                            <span>•</span>
                            <div className="flex flex-col text-right">
                              {unit.hasCalendarEvents ? (
                                <>
                                  <span>{items.filter(t => t.type === 'calendar').length} Calendar</span>
                                  <span>{items.filter(t => t.type === 'task').length} Tasks</span>
                                </>
                              ) : (
                                <span>{items.length} Tasks</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                // Check if there are gaps for this hour that should be displayed
                (() => {
                  // Find gaps that span this hour
                  const gapsForThisHour = gaps.filter(gap => {
                    if (!gap.start_time || !gap.end_time) return false;
                    
                    try {
                      let gapStart: Date;
                      let gapEnd: Date;
                      
                      if (gap.start_time.includes('T')) {
                        gapStart = parseISO(gap.start_time);
                      } else {
                        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
                        gapStart = parseISO(`${selectedDateStr}T${gap.start_time}`);
                      }
                      
                        if (gap.end_time.includes('T')) {
                        gapEnd = parseISO(gap.end_time);
                      } else {
                          const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
                        gapEnd = parseISO(`${selectedDateStr}T${gap.end_time}`);
                      }
                      
                      // Check if gap overlaps with this hour
                      const gapStartHour = gapStart.getHours();
                      const gapEndHour = gapEnd.getHours();
                      
                      return (gapStartHour <= slot.hour24 && gapEndHour >= slot.hour24) ||
                             (gapStartHour === slot.hour24) ||
                             (gapEndHour === slot.hour24);
                    } catch (error) {
                      return false;
                    }
                  });
                  
                  if (gapsForThisHour.length > 0) {
                    // Display the gaps for this hour
                    return gapsForThisHour.map((gap) => {
                      const gapSourceInfo = getGapSourceInfo(gap);
                      
                      // Calculate the portion of the gap that falls within this hour
                      let displayStart: Date;
                      let displayEnd: Date;
                      
                      try {
                        if (gap.start_time.includes('T')) {
                          displayStart = parseISO(gap.start_time);
                        } else {
                          const selectedDateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                          displayStart = parseISO(`${selectedDateStr}T${gap.start_time}`);
                        }
                        
                        if (gap.end_time.includes('T')) {
                          displayEnd = parseISO(gap.end_time);
                        } else {
                          const selectedDateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                          displayEnd = parseISO(`${selectedDateStr}T${gap.end_time}`);
                        }
                        
                        // Adjust to show only the portion within this hour
                        const hourStart = new Date(displayStart);
                        hourStart.setHours(slot.hour24, 0, 0, 0);
                        const hourEnd = new Date(displayStart);
                        hourEnd.setHours(slot.hour24 + 1, 0, 0, 0);
                        
                        displayStart = displayStart < hourStart ? hourStart : displayStart;
                        displayEnd = displayEnd > hourEnd ? hourEnd : displayEnd;

                        // If this is the current hour and we're within the gap portion, reduce available time by now
                        const isTodaySelected = isSameDay(selectedDate, currentTime);
                        if (isTodaySelected && slot.hour24 === currentHour && currentTime >= displayStart && currentTime < displayEnd) {
                          displayStart = new Date(currentTime);
                        }
                        
                        // If we're in the current hour and inside this portion, start from now
                        const isTodaySelected2 = isSameDay(selectedDate, currentTime);
                        if (isTodaySelected2 && slot.hour24 === currentHour && currentTime >= displayStart && currentTime < displayEnd) {
                          displayStart = new Date(currentTime);
                        }

                        const durationMinutes = Math.round((displayEnd.getTime() - displayStart.getTime()) / (1000 * 60));
                        const durationText = durationMinutes >= 60 
                          ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ''}`
                          : `${durationMinutes}m`;
                        
                        return (
                          <button
                            key={`gap-${gap.id}-${slot.hour24}`}
                            onClick={() => onGapUtilize(gap)}
                            className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation bg-slate-800/30 hover:bg-slate-800/50 border ${gapSourceInfo?.borderColor || 'border-slate-700/20'} hover:border-slate-600/40`}
                            type="button"
                          >
                            <div className="flex items-center gap-3">
                              {/* Icon */}
                              <div 
                                className={`w-10 h-10 ${gapSourceInfo.color} rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                              >
                                {gapSourceInfo.icon}
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <h3 className="text-white font-medium truncate text-base">
                                    Gap
                                  </h3>
                                  <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded-full">
                                    {gapSourceInfo.label}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3 text-sm text-slate-400">
                                  <span className="truncate font-medium">
                                    {formatTimeRange(displayStart, displayEnd)}
                                  </span>
                                  {userPreferences?.show_duration_in_planner && (
                                    <>
                                      <span>•</span>
                                      <span>{durationText}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      } catch (error) {
                        return null;
                      }
                    });
                  } else {
                    // Show empty state for working hours with no content
                    return (
                      <div className="w-full rounded-2xl p-4 border border-slate-700/20 bg-slate-800/10">
                        <div className="text-center">
                          <span className="text-slate-500 text-sm">Gap</span>
                        </div>
                      </div>
                    );
                  }
                })()
              )}
            </div>
          </div>
        );
      })}
      
      {timelineItems.length === 0 && (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-slate-400 text-lg font-medium mb-2">
            No activities scheduled
          </h3>
          <p className="text-slate-500 text-sm">
            Add tasks or check your calendar sync to see your schedule
          </p>
        </div>
      )}
    </div>
    {/* Activity Stack Modal - handles overlapping task groups */}
    <ActivityStackModal
      isOpen={stackModalOpen}
      onClose={() => setStackModalOpen(false)}
      activities={selectedStack}
      timeSlot={selectedTimeSlot}
      onActivitySelect={(activity) => {
        setStackModalOpen(false);
        onTaskEdit?.(activity);
      }}
      onStartTimer={(activity) => {
        setStackModalOpen(false);
        onTaskOpen(activity);
      }}
      stackReason={selectedStack.length <= 1 ? 'single' : 'time_overlap'}
    />
    {/* Overlap Modal - handles mixed calendar/task overlaps */}
    <OverlapModal
      isOpen={overlapModalOpen}
      onClose={() => setOverlapModalOpen(false)}
      tasks={selectedOverlap?.tasks || []}
      calendarEvents={selectedOverlap?.calendarEvents || []}
      timeSlot={selectedOverlap?.timeSlot || ''}
      onActivitySelect={(activity) => {
        setOverlapModalOpen(false);
        onTaskEdit?.(activity);
      }}
      onStartTimer={(activity) => {
        setOverlapModalOpen(false);
        onTaskOpen(activity);
      }}
    />
    
    {/* Calendar Event Modal - handles individual calendar event details */}
    <CalendarEventModal
      event={selectedCalendarEvent}
      isOpen={calendarEventModalOpen}
      onClose={() => {
        setCalendarEventModalOpen(false);
        setSelectedCalendarEvent(null);
      }}
    />
    </>
  );
}

export { PlannerTimeline };