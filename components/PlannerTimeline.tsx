import { useState, useMemo, useEffect, useRef } from 'react';
import { format, parseISO, addMinutes, isSameDay } from 'date-fns';
import { Clock, User, Briefcase, Heart, Brain, Coffee, Moon, Target, Calendar, Settings, Sparkles } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon } from '../utils/helpers';
import { ActivityStackModal } from './ActivityStackModal';

interface TimelineItem {
  id: string;
  type: 'task' | 'gap';
  startTime: Date;
  endTime: Date;
  title: string;
  duration: string;
  category?: string;
  icon: React.ReactNode;
  iconColor: string;
  data: Task | TimeGap;
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
  hasWorkingDays = true
}: PlannerTimelineProps) {
  
  // Ref for the timeline container to enable auto-scrolling
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Stacking modal state (overlaps only)
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Task[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  
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
  }, [tasks, gaps, selectedDate, userPreferences, currentTime]);
  
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
    return timelineItems.filter(item => {
      const itemHour = item.startTime.getHours();
      return itemHour === hour;
    });
  };
  
  // Group overlapping tasks among a set of timeline items (tasks only)
  const groupOverlappingTasks = (items: TimelineItem[]) => {
    const taskItems = items
      .filter((it) => it.type === 'task')
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const groups: { items: TimelineItem[]; startTime: Date; endTime: Date }[] = [];
    let currentGroup: TimelineItem[] = [];
    let currentGroupEnd: Date | null = null;

    for (const item of taskItems) {
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
      });
    }

    return groups;
  };
  
  const formatTimeRange = (startTime: Date, endTime: Date) => {
    const is24Hour = userPreferences?.time_format === '24h';
    const timeFormat = is24Hour ? 'HH:mm' : 'h:mm a';
    const start = format(startTime, timeFormat);
    const end = format(endTime, timeFormat);
    return `${start} - ${end}`;
  };
  
  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'task') {
      onTaskOpen(item.data as Task);
    } else {
      onGapUtilize(item.data as TimeGap);
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

        // Build render units: gaps as-is, tasks grouped by overlap
        type RenderUnit =
          | { kind: 'gap'; item: TimelineItem }
          | { kind: 'taskGroup'; items: TimelineItem[]; startTime: Date; endTime: Date };

        const gapUnits: RenderUnit[] = itemsAtHour
          .filter((it) => it.type === 'gap')
          .map((gap) => ({ kind: 'gap', item: gap }));

        const taskGroups = groupOverlappingTasks(itemsAtHour);
        const groupUnits: RenderUnit[] = taskGroups.map((g) => ({
          kind: 'taskGroup',
          items: g.items,
          startTime: g.startTime,
          endTime: g.endTime,
        }));

        const renderUnits: RenderUnit[] = [...gapUnits, ...groupUnits].sort(
          (a, b) =>
            (a.kind === 'gap' ? a.item.startTime.getTime() : a.startTime.getTime()) -
            (b.kind === 'gap' ? b.item.startTime.getTime() : b.startTime.getTime())
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
            
            {/* Timeline items */}
            <div className="flex-1 space-y-3">
              {renderUnits.length > 0 ? (
                renderUnits.map((unit) => {
                  if (unit.kind === 'gap') {
                    const item = unit.item;
                    const gapSourceInfo = getGapSourceInfo(item.data as TimeGap);
                    return (
                      <button
                        key={`${item.type}-${item.id}-${item.startTime.getTime()}`}
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
                            <div className="flex items-center gap-3 text-sm text-slate-400">
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
                                  minutesLeftInHour = Math.max(0, Math.round((hourEnd.getTime() - currentTime.getTime()) / (1000 * 60)));
                                }
                                return (
                                  <>
                                    <span className="truncate font-medium">
                                      {formatTimeRange(displayStart, displayEnd)}
                                    </span>
                                    {minutesLeftInHour !== null && (
                                      <>
                                        <span>•</span>
                                        <span>{`${minutesLeftInHour} Minutes Left In Current Hour`}</span>
                                      </>
                                    )}
                                    {userPreferences?.show_duration_in_planner && minutesLeftInHour === null && (
                                      <>
                                        <span>•</span>
                                        <span>{item.duration}</span>
                                      </>
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

                  // Stack button for overlapping tasks
                  return (
                    <button
                      key={`stack-${slot.hour24}-${startTime.getTime()}`}
                      onClick={() => {
                        setSelectedStack(items.map((t) => t.data as Task));
                        setSelectedTimeSlot(formatTimeRange(startTime, endTime));
                        setStackModalOpen(true);
                      }}
                      className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation bg-slate-800/40 hover:bg-slate-800/60 border border-amber-500/30 hover:border-amber-500/50`}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                          <Clock className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-white font-medium truncate text-base">{items.length} overlapping activities</h3>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-slate-400">
                            <span className="truncate font-medium">{formatTimeRange(startTime, endTime)}</span>
                            <span>•</span>
                            <span>{items.length} tasks</span>
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
    </>
  );
}

export { PlannerTimeline };