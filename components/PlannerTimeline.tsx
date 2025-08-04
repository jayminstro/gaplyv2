import { useState, useMemo } from 'react';
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
    const source = gap.gap_source_id || gap.source;
    
    switch (source) {
      case 'calendar':
        return {
          icon: <Calendar className="w-4 h-4 text-blue-400" />,
          color: 'bg-blue-500/20',
          borderColor: 'border-blue-500/30',
          label: 'Calendar'
        };
      case 'manual':
        return {
          icon: <Settings className="w-4 h-4 text-purple-400" />,
          color: 'bg-purple-500/20',
          borderColor: 'border-purple-500/30',
          label: 'Manual'
        };
      case 'default':
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
    
    // Get working hours for filtering
    const workStartHour = userPreferences?.calendar_work_start 
      ? parseInt(userPreferences.calendar_work_start.split(':')[0]) 
      : 9;
    const workEndHour = userPreferences?.calendar_work_end 
      ? parseInt(userPreferences.calendar_work_end.split(':')[0]) 
      : 17;
    
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
    
    // Add gaps - split long gaps into hourly segments
    gaps.forEach(gap => {
      if (!gap.start_time) return;
      if (!gap.end_time) return;
      
      // Handle different gap time formats
      const gapStart = gap.start_time;
      const gapEnd = gap.end_time;
      
      // Parse gap times - handle both full datetime and time-only formats
      let startTime: Date;
      let endTime: Date;
      
      try {
        if (gapStart && gapStart.includes('T')) {
          startTime = parseISO(gapStart);
        } else if (gapStart) {
          // Time only format - combine with selected date
          const selectedDateStr = selectedDate.toISOString().split('T')[0];
          startTime = parseISO(`${selectedDateStr}T${gapStart}`);
        } else {
          return; // Skip if no valid start time
        }
        
        if (gapEnd && gapEnd.includes('T')) {
          endTime = parseISO(gapEnd);
        } else if (gapEnd) {
          // Time only format - combine with selected date
          const selectedDateStr = selectedDate.toISOString().split('T')[0];
          endTime = parseISO(`${selectedDateStr}T${gapEnd}`);
        } else {
          return; // Skip if no valid end time
        }
      } catch (error) {
        console.warn('Failed to parse gap times:', { gapStart, gapEnd, error });
        return;
      }
      
      // Check if gap overlaps with working hours - filter out gaps completely outside working hours
      if (!isGapWithinWorkingHours(startTime, endTime)) {
        return; // Skip gaps that don't overlap with working hours
      }
      
      // Calculate duration in a readable format
      const totalDurationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      
      // Validate duration makes sense (should be positive and reasonable)
      if (totalDurationMinutes <= 0 || totalDurationMinutes > 24 * 60) {
        return; // Skip gaps with invalid durations
      }
      
      // Get gap source info for visual distinction
      const gapSourceInfo = getGapSourceInfo(gap);
      
      // Always use 'Gap' as the label for consistency across the app
      const gapLabel = 'Gap';
      
      // Split gap into hourly segments
      const startHour = startTime.getHours();
      const endHour = endTime.getHours();
      
      // If gap is within a single hour, create one segment
      if (startHour === endHour) {
        const segmentDurationMinutes = totalDurationMinutes;
        let segmentDurationText = '';
        
        if (segmentDurationMinutes >= 60) {
          const hours = Math.floor(segmentDurationMinutes / 60);
          const minutes = segmentDurationMinutes % 60;
          segmentDurationText = `${hours}h`;
          if (minutes > 0) segmentDurationText += ` ${minutes}m`;
        } else {
          segmentDurationText = `${segmentDurationMinutes}m`;
        }
        
        items.push({
          id: `${gap.id}-segment-${startHour}`,
          type: 'gap',
          startTime,
          endTime,
          title: gapLabel,
          duration: segmentDurationText,
          icon: gapSourceInfo.icon,
          iconColor: gapSourceInfo.color,
          gapSource: gap.gap_source_id || gap.source,
          data: gap
        });
      } else {
        // Split into multiple hourly segments
        for (let hour = startHour; hour <= endHour; hour++) {
          let segmentStart: Date;
          let segmentEnd: Date;
          
          if (hour === startHour) {
            // First segment: from original start time to end of hour
            segmentStart = startTime;
            segmentEnd = new Date(startTime);
            segmentEnd.setHours(hour + 1, 0, 0, 0);
          } else if (hour === endHour) {
            // Last segment: from start of hour to original end time
            segmentStart = new Date(endTime);
            segmentStart.setHours(hour, 0, 0, 0);
            segmentEnd = endTime;
          } else {
            // Middle segments: full hour
            segmentStart = new Date(startTime);
            segmentStart.setHours(hour, 0, 0, 0);
            segmentEnd = new Date(startTime);
            segmentEnd.setHours(hour + 1, 0, 0, 0);
          }
          
          // Calculate segment duration
          const segmentDurationMinutes = Math.round((segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60));
          
          // Skip segments with no duration
          if (segmentDurationMinutes <= 0) continue;
          
          let segmentDurationText = '';
          if (segmentDurationMinutes >= 60) {
            const hours = Math.floor(segmentDurationMinutes / 60);
            const minutes = segmentDurationMinutes % 60;
            segmentDurationText = `${hours}h`;
            if (minutes > 0) segmentDurationText += ` ${minutes}m`;
          } else {
            segmentDurationText = `${segmentDurationMinutes}m`;
          }
          
          items.push({
            id: `${gap.id}-segment-${hour}`,
            type: 'gap',
            startTime: segmentStart,
            endTime: segmentEnd,
            title: gapLabel,
            duration: segmentDurationText,
            icon: gapSourceInfo.icon,
            iconColor: gapSourceInfo.color,
            gapSource: gap.gap_source_id || gap.source,
            data: gap
          });
        }
      }
    });
    
    // Sort by start time
    return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [tasks, gaps, selectedDate, userPreferences]);
  
  // Generate time slots for the day based on user's working hours
  const generateTimeSlots = () => {
    const slots = [];
    const is24Hour = userPreferences?.time_format === '24h';

    // Always use user's working hours as the primary range
    let startHour, endHour;
    
    if (userPreferences?.calendar_work_start && userPreferences?.calendar_work_end) {
      // Use user's working hours from settings
      startHour = parseInt(userPreferences.calendar_work_start.split(':')[0]);
      endHour = parseInt(userPreferences.calendar_work_end.split(':')[0]);
      
      // Ensure end hour is after start hour (handle overnight shifts)
      if (endHour <= startHour) {
        endHour = 23; // If end is before start, extend to end of day
      }
    } else {
      // Fallback to default working hours if not set
      startHour = 9;
      endHour = 17;
    }

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

  // Check if current time should be shown (only for today)
  const shouldShowCurrentTime = isSameDay(selectedDate, currentTime);
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();

  return (
    <div className="space-y-4 pb-8 relative">
      {timeSlots.map((slot) => {
        const itemsAtHour = getItemsForHour(slot.hour24);
        
        return (
          <div key={slot.time} className="flex items-start gap-4 relative">
            {/* Time label */}
            <div className="w-16 flex-shrink-0 text-slate-400 text-xs font-medium pt-2">
              {slot.display}
            </div>
            
            {/* Current time marker */}
            {shouldShowCurrentTime && slot.hour24 === currentHour && (
              <div className="absolute left-20 top-0 bottom-0 w-0.5 bg-red-500 z-10 flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 shadow-lg"></div>
                <div className="absolute left-4 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Now
                </div>
              </div>
            )}
            
            {/* Timeline items */}
            <div className="flex-1 space-y-3">
              {itemsAtHour.length > 0 ? (
                itemsAtHour.map((item) => {
                  const isGap = item.type === 'gap';
                  const gapSourceInfo = isGap ? getGapSourceInfo(item.data as TimeGap) : null;
                  
                  return (
                    <button
                      key={item.id}
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
                // Show empty state for working hours with no content
                <div className="w-full rounded-2xl p-4 border border-slate-700/20 bg-slate-800/10">
                  <div className="text-center">
                    <span className="text-slate-500 text-sm">Available time</span>
                  </div>
                </div>
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