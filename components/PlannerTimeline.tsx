import { useState, useMemo, useEffect, useRef } from 'react';
import { format, parseISO, addMinutes, isBefore, isAfter, isSameDay } from 'date-fns';
import { Clock, User, Briefcase, Heart, Brain, Coffee, Moon, Target, Zap, Calendar, Settings, Sparkles } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon } from '../utils/helpers';

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
  onGapUtilize: (gap: TimeGap) => void;
  userPreferences?: UserPreferences;
}

function PlannerTimeline({ 
  tasks, 
  gaps, 
  selectedDate, 
  currentTime,
  onTaskOpen, 
  onGapUtilize,
  userPreferences 
}: PlannerTimelineProps) {
  
  // Ref for the timeline container to enable auto-scrolling
  const timelineRef = useRef<HTMLDivElement>(null);
  
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
    console.log(`🔍 PlannerTimeline Debug - Processing ${gaps.length} gaps for date: ${selectedDate.toLocaleDateString('en-CA')}`);
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
          
          items.push({
            id: gap.id,
            type: 'gap',
            startTime,
            endTime,
            title: `Gap`,
            duration: `${gap.duration_minutes} min`,
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
  }, [tasks, gaps, selectedDate, userPreferences]);
  
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

    // Always show full working hours range for scrolling
    for (let hour = startHour; hour <= endHour; hour++) {
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
  
  const timeSlots = generateTimeSlots();
  
  // Check if current time should be shown (only for today)
  const shouldShowCurrentTime = isSameDay(selectedDate, currentTime);
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  
  // Auto-scroll to current time when viewing today
  useEffect(() => {
    if (!timelineRef.current || !shouldShowCurrentTime) return;
    
    // Find the current hour element
    const currentHourIndex = timeSlots.findIndex(slot => slot.hour24 === currentHour);
    if (currentHourIndex === -1) return;
    
    // Calculate target scroll position to center the current time
    const timelineElement = timelineRef.current;
    const timelineHeight = timelineElement.clientHeight;
    const totalSlotsHeight = timeSlots.length * 100; // Approximate height per slot
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
    <div ref={timelineRef} className="space-y-4 pb-8 relative">
      {timeSlots.map((slot) => {
        const itemsAtHour = getItemsForHour(slot.hour24);
        
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
              {itemsAtHour.length > 0 ? (
                itemsAtHour.map((item) => {
                  const isGap = item.type === 'gap';
                  const gapSourceInfo = isGap ? getGapSourceInfo(item.data as TimeGap) : null;
                  
                  return (
                    <button
                      key={`${item.type}-${item.id}-${item.startTime.getTime()}`}
                      onClick={() => handleItemClick(item)}
                      className={`w-full backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 text-left group active:scale-[0.98] touch-manipulation ${
                        isGap
                          ? `bg-slate-800/30 hover:bg-slate-800/50 border ${gapSourceInfo?.borderColor || 'border-slate-700/20'} hover:border-slate-600/40`
                          : 'bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 hover:border-slate-600/50'
                      }`}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div 
                          className={`w-10 h-10 ${item.iconColor} rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                        >
                          {item.type === 'gap' ? item.icon : renderSafeIcon(item.icon)}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-white font-medium truncate text-base">
                              {item.title}
                            </h3>
                            {isGap && gapSourceInfo && (
                              <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded-full">
                                {gapSourceInfo.label}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-sm text-slate-400">
                            <span className="truncate font-medium">
                              {formatTimeRange(item.startTime, item.endTime)}
                            </span>
                            {userPreferences?.show_duration_in_planner && (
                              <>
                                <span>•</span>
                                <span>{item.duration}</span>
                              </>
                            )}
                            {item.type === 'task' && item.category && (
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
                        const selectedDateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                        gapStart = parseISO(`${selectedDateStr}T${gap.start_time}`);
                      }
                      
                      if (gap.end_time.includes('T')) {
                        gapEnd = parseISO(gap.end_time);
                      } else {
                        const selectedDateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
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
  );
}

export { PlannerTimeline };