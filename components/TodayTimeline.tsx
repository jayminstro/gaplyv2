import { useState, useEffect } from 'react';
import { ActivityStackModal } from './ActivityStackModal';
import { GapUtilizationModal } from './GapUtilizationModal';
import { DayCompleteBanner } from './DayCompleteBanner';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { 
  renderSafeIcon, 
  formatTimelineTime, 
  timeToMinutes, 
  minutesToTime
} from '../utils/helpers';

interface TimelineItem {
  type: 'activity' | 'gap' | 'stack';
  id: string;
  title: string;
  duration: number; // in minutes for gaps, fixed duration for activities
  startTime: string;
  endTime: string;
  color?: string;
  icon?: string;
  data?: Task | Task[] | null;
  count?: number;
  position: number; // percentage position in timeline
  width: number; // percentage width for both gaps and activities
  stackType?: 'collision' | 'summary'; // stacking strategy used
  stackReason?: 'time_overlap' | 'visual_proximity' | 'single'; // reason for grouping
}

interface TodayTimelineProps {
  tasks: Task[];
  gaps: TimeGap[];
  currentTime?: Date;
  userPreferences?: UserPreferences;
  onItemClick?: (item: TimelineItem) => void;
  onTaskSelect?: (task: Task) => void;
  onStartTimer?: (task: Task) => void;
  onTaskCreated?: (task: Task) => void;
}

export function TodayTimeline({ 
  tasks, 
  gaps: _gaps, 
  currentTime: _currentTime = new Date(), 
  userPreferences,
  onItemClick,
  onTaskSelect,
  onStartTimer,
  onTaskCreated
}: TodayTimelineProps) {
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Task[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [gapModalOpen, setGapModalOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<TimeGap | null>(null);

  // Inform the app about modal visibility so global UI (e.g., bottom nav) can react consistently
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('ui:modalOpen', { detail: { type: 'gap-utilization', open: gapModalOpen } }));
    } catch {}
    return () => {
      try {
        window.dispatchEvent(new CustomEvent('ui:modalOpen', { detail: { type: 'gap-utilization', open: false } }));
      } catch {}
    };
  }, [gapModalOpen]);

  // Handle creating a gap for utilization
  const handleCreateAndUtilizeGap = (item: TimelineItem) => {
    // Create a synthetic gap object for the modal
    // Use a clearly identifiable synthetic ID that won't be confused with UUIDs
    const syntheticId = `timeline-gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const timelineGap: TimeGap = {
      id: syntheticId,
      start_time: item.startTime, // Should already be in HH:MM format from timeline generation
      end_time: item.endTime, // Should already be in HH:MM format from timeline generation
      duration_minutes: item.duration,
      user_id: 'synthetic-user',
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modified_by: 'user'
    };
    
    console.log('🔧 Opening gap utilization modal for synthetic timeline gap:', {
      id: timelineGap.id,
      isSynthetic: true,
      start_time: timelineGap.start_time,
      end_time: timelineGap.end_time,
      duration: timelineGap.duration_minutes,
      format: 'Timeline generates clean HH:MM format'
    });
    
    setSelectedGap(timelineGap);
    setGapModalOpen(true);
  };
  // Real-time updates - single timer for better performance
  const [realCurrentTime, setRealCurrentTime] = useState(new Date());
  
  useEffect(() => {
    // Single timer that updates every 30 seconds for balance between performance and accuracy
    const updateTime = () => {
      setRealCurrentTime(new Date());
    };

    // Initial update
    updateTime();

    // Set interval for periodic updates
    const interval = setInterval(updateTime, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);
  
  // Get work times from user preferences
  const workStartTime = userPreferences?.calendar_work_start || '09:00';
  const workEndTime = userPreferences?.calendar_work_end || '17:00';
  const minGapDuration = userPreferences?.calendar_min_gap || 15; // minutes
  
  const workStartMinutes = timeToMinutes(workStartTime);
  const workEndMinutes = timeToMinutes(workEndTime);
  
  // Calculate dynamic timeline start based on real current time
  const actualCurrentTime = realCurrentTime; // Use real device time for calculations
  const currentMinutes = actualCurrentTime.getHours() * 60 + actualCurrentTime.getMinutes();
  const roundedCurrentMinutes = Math.floor(currentMinutes / 15) * 15; // Round to nearest 15 minutes
  
  // Timeline start logic:
  // - If current time is before work start: show banner
  // - If current time is within work hours: start from current time (rounded)
  // - If current time is after work end: show banner
  let timelineStartMinutes: number;
  let timelineEndMinutes: number;
  let showBanner = false;
  let isBeforeWorkHours = false;
  
  if (currentMinutes < workStartMinutes) {
    // Before work hours - show banner
    showBanner = true;
    isBeforeWorkHours = true;
    timelineStartMinutes = workStartMinutes;
    timelineEndMinutes = workEndMinutes;
  } else if (currentMinutes <= workEndMinutes) {
    // During work hours - show from current time to end
    timelineStartMinutes = roundedCurrentMinutes;
    timelineEndMinutes = workEndMinutes;
  } else {
    // After work hours - show banner
    showBanner = true;
    isBeforeWorkHours = false;
    timelineStartMinutes = workStartMinutes;
    timelineEndMinutes = workEndMinutes;
  }
  
  const totalTimelineMinutes = timelineEndMinutes - timelineStartMinutes;
  const startTimeStr = minutesToTime(timelineStartMinutes);
  const endTimeStr = minutesToTime(timelineEndMinutes);
  
  // Remove unused helper in compact view

  // Time-collision configuration: only stack actual overlaps
  const maxStackSize = 3; // Maximum individual activities before creating a summary stack
  
  // Process and sort scheduled activities chronologically
  const scheduledActivities = tasks
    .filter(task => {
      if (!task.dueTime || !task.dueDate) return false;
      
      // Check if the task is for today
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      if (task.dueDate !== today) {
        console.log('🔍 Filtered out task not for today:', task.title, 'dueDate:', task.dueDate, 'today:', today);
        return false;
      }
      
      const taskMinutes = timeToMinutes(task.dueTime);
      const taskDurationMinutes = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
      const taskEndMinutes = taskMinutes + taskDurationMinutes;
      
      // Filter out activities that are in the past (have already ended)
      if (taskEndMinutes <= currentMinutes) {
        console.log('🔍 Filtered out past task:', task.title, 'endTime:', minutesToTime(taskEndMinutes), 'currentTime:', minutesToTime(currentMinutes));
        return false;
      }
      
      // Include activities that overlap the visible timeline (even if already started)
      const isInTimelineRange = (taskEndMinutes > timelineStartMinutes) && (taskMinutes < timelineEndMinutes);
      if (!isInTimelineRange) {
        console.log('🔍 Filtered out task outside timeline range:', task.title, 'taskTime:', minutesToTime(taskMinutes), 'timelineRange:', `${minutesToTime(timelineStartMinutes)}-${minutesToTime(timelineEndMinutes)}`);
        return false;
      }
      
      console.log('✅ Task included in timeline:', task.title, 'time:', minutesToTime(taskMinutes), 'duration:', task.duration);
      return true;
    })
    .map(task => {
      const startMinutes = timeToMinutes(task.dueTime!);
      const durationMinutes = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
      
      return {
        task,
        startMinutes,
        endMinutes: startMinutes + durationMinutes,
        duration: durationMinutes,
        priority: task.priority || 'medium'
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // Proximity-based stacking logic to reduce visual overload
  const createProximityBasedStacks = () => {
    if (scheduledActivities.length === 0) return [];
    
    const stacks: { 
      activities: typeof scheduledActivities; 
      startMinutes: number; 
      endMinutes: number; 
      isCollisionStack: boolean;
      stackReason: 'time_overlap' | 'visual_proximity' | 'single';
    }[] = [];
    let currentStack: typeof scheduledActivities = [];
    
    for (let i = 0; i < scheduledActivities.length; i++) {
      const currentActivity = scheduledActivities[i];
      
      if (currentStack.length === 0) {
        // Start new stack
        currentStack = [currentActivity];
      } else {
        // Only group if activities truly overlap in time
        const shouldGroup = currentStack.some(stackActivity => {
          const overlaps = (currentActivity.startMinutes < stackActivity.endMinutes && 
                           currentActivity.endMinutes > stackActivity.startMinutes);
          return overlaps;
        });
        
        if (shouldGroup) {
          // Add to current stack
          currentStack.push(currentActivity);
        } else {
          // Finalize current stack and start new one
          const stackStartMinutes = Math.min(...currentStack.map(a => a.startMinutes));
          const stackEndMinutes = Math.max(...currentStack.map(a => a.endMinutes));
          
           // Determine stack reason
           let stackReason: 'time_overlap' | 'visual_proximity' | 'single' = 'single';
           if (currentStack.length > 1) {
             // Only overlapping stacks are allowed
             stackReason = 'time_overlap';
           }
          
          stacks.push({
            activities: currentStack,
            startMinutes: stackStartMinutes,
            endMinutes: stackEndMinutes,
            isCollisionStack: currentStack.length > 1,
            stackReason
          });
          
          // Start new stack with current activity
          currentStack = [currentActivity];
        }
      }
    }
    
    // Don't forget the last stack
    if (currentStack.length > 0) {
      const stackStartMinutes = Math.min(...currentStack.map(a => a.startMinutes));
      const stackEndMinutes = Math.max(...currentStack.map(a => a.endMinutes));
      
      // Determine stack reason
      let stackReason: 'time_overlap' | 'visual_proximity' | 'single' = 'single';
      if (currentStack.length > 1) {
        stackReason = 'time_overlap';
      }
      
      stacks.push({
        activities: currentStack,
        startMinutes: stackStartMinutes,
        endMinutes: stackEndMinutes,
        isCollisionStack: currentStack.length > 1,
        stackReason
      });
    }
    
    return stacks;
  };

  const proximityBasedStacks = createProximityBasedStacks();

  // Create timeline items from proximity-based stacks
  const activityItems: TimelineItem[] = proximityBasedStacks.map((stack, index) => {
    // Position based on actual start time
    const position = ((stack.startMinutes - timelineStartMinutes) / totalTimelineMinutes) * 100;
    // Calculate visual width based on time duration (for consistent sizing with separation)
    const baseWidth = ((stack.endMinutes - stack.startMinutes) / totalTimelineMinutes) * 100;
    const visualWidth = Math.max(10, Math.min(28, baseWidth)); // Increased minimum and maximum for better visibility
    
    if (stack.activities.length === 1) {
      // Single activity
      const activity = stack.activities[0];
      return {
        type: 'activity',
        id: activity.task.id,
        title: activity.task.title,
        duration: activity.duration,
        startTime: activity.task.dueTime!,
        endTime: minutesToTime(activity.endMinutes),
        color: activity.task.iconColor,
        icon: activity.task.icon,
        data: activity.task,
        position,
        width: visualWidth,
        stackReason: 'single'
      };
    } else if (stack.activities.length <= maxStackSize) {
      // Small grouped stack - different display based on reason
      const totalDuration = stack.activities.reduce((sum, act) => sum + act.duration, 0);
      const displayTitle = stack.stackReason === 'time_overlap' 
        ? `${stack.activities.length} overlapping`
        : `${stack.activities.length} activities`;
      
      return {
        type: 'stack',
        id: `grouped-stack-${index}`,
        title: displayTitle,
        duration: totalDuration,
        startTime: minutesToTime(stack.startMinutes),
        endTime: minutesToTime(stack.endMinutes),
        data: stack.activities.map(act => act.task),
        count: stack.activities.length,
        position,
        width: Math.max(visualWidth, 16), // Larger for better readability of stacked activities
        stackType: 'collision',
        stackReason: stack.stackReason
      };
    } else {
      // Large grouped stack - show as summary
      const totalDuration = stack.activities.reduce((sum, act) => sum + act.duration, 0);
      return {
        type: 'stack',
        id: `summary-stack-${index}`,
        title: `+${stack.activities.length}`,
        duration: totalDuration,
        startTime: minutesToTime(stack.startMinutes),
        endTime: minutesToTime(stack.endMinutes),
        data: stack.activities.map(act => act.task),
        count: stack.activities.length,
        position,
        width: Math.max(visualWidth, 14), // Adequate size for summary display
        stackType: 'summary',
        stackReason: stack.stackReason
      };
    }
  });

  // Generate gaps between non-overlapping activities
  const generateTimeTrimmedGaps = (): TimelineItem[] => {
    const gaps: TimelineItem[] = [];
    
    // If no activities, show one continuous gap
    if (proximityBasedStacks.length === 0) {
      const totalMinutes = timelineEndMinutes - timelineStartMinutes;
      if (totalMinutes >= minGapDuration) {
        gaps.push({
          type: 'gap',
          id: 'full-timeline-gap',
          title: 'Gap',
          duration: totalMinutes,
          startTime: startTimeStr,
          endTime: endTimeStr,
          data: null,
          position: 0,
          width: 100
        });
      }
      return gaps;
    }

    // Sort stacks by start time (should already be sorted, but ensure it)
    const sortedStacks = [...proximityBasedStacks].sort((a, b) => a.startMinutes - b.startMinutes);
    
    let currentTimePosition = timelineStartMinutes;

    sortedStacks.forEach((stack, index) => {
      // Create gap before this stack if there's time
      if (stack.startMinutes > currentTimePosition) {
        const gapDuration = stack.startMinutes - currentTimePosition;
        
        if (gapDuration >= minGapDuration) {
          const position = ((currentTimePosition - timelineStartMinutes) / totalTimelineMinutes) * 100;
          const width = (gapDuration / totalTimelineMinutes) * 100;
          
          gaps.push({
            type: 'gap',
            id: `gap-before-${index}`,
            title: 'Gap',
            duration: gapDuration,
            startTime: minutesToTime(currentTimePosition),
            endTime: minutesToTime(stack.startMinutes),
            data: null,
            position,
            width: Math.max(width, 5) // Minimum 5% width for usability
          });
        }
      }

      // Move time position to end of current stack
      currentTimePosition = Math.max(currentTimePosition, stack.endMinutes);
    });

    // Create final gap if time remains
    if (currentTimePosition < timelineEndMinutes) {
      const gapDuration = timelineEndMinutes - currentTimePosition;
      
      if (gapDuration >= minGapDuration) {
        const position = ((currentTimePosition - timelineStartMinutes) / totalTimelineMinutes) * 100;
        const width = (gapDuration / totalTimelineMinutes) * 100;
        
        gaps.push({
          type: 'gap',
          id: 'final-gap',
          title: 'Gap',
          duration: gapDuration,
          startTime: minutesToTime(currentTimePosition),
          endTime: endTimeStr,
          data: null,
          position,
          width: Math.max(width, 5)
        });
      }
    }

    return gaps;
  };

  const gapBlocks = generateTimeTrimmedGaps();
  const allItems = [...activityItems, ...gapBlocks];

  // Compute the next 3 items (activities or gaps) from current time
  const itemsSortedByStart = [...allItems].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const upcomingItems = itemsSortedByStart.filter(
    (item) => timeToMinutes(item.endTime) > roundedCurrentMinutes
  );
  let displayItems = upcomingItems.slice(0, 3);

  // If we have fewer than 3 items, try to split a long upcoming gap into chunks
  if (displayItems.length < 3) {
    const firstUpcomingGap = upcomingItems.find((i) => i.type === 'gap');
    if (firstUpcomingGap) {
      // If the original gap is already present in displayItems, remove it before chunking
      const originalGapIndex = displayItems.findIndex((d) => d.id === firstUpcomingGap.id);
      if (originalGapIndex !== -1) {
        displayItems.splice(originalGapIndex, 1);
      }
      const gapStartMin = Math.max(timeToMinutes(firstUpcomingGap.startTime), roundedCurrentMinutes);
      const gapEndMin = timeToMinutes(firstUpcomingGap.endTime);
      const chunkSize = 60; // split into 60-minute chunks (consistent with gap generation)
      const chunks: TimelineItem[] = [];
      for (let s = gapStartMin; s < gapEndMin; s += chunkSize) {
        const e = Math.min(s + chunkSize, gapEndMin);
        const duration = e - s;
        if (duration <= 0) break;
        chunks.push({
          ...firstUpcomingGap,
          id: `${firstUpcomingGap.id}-c${s}`,
          startTime: minutesToTime(s),
          endTime: minutesToTime(e),
          duration,
        });
      }

      // Append chunks after the first included item(s), avoiding duplicates by id
      for (const ch of chunks) {
        if (displayItems.length >= 3) break;
        if (!displayItems.some((d) => d.id === ch.id)) {
          displayItems.push(ch);
        }
      }

      // Keep chronological order
      displayItems = displayItems.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }
  }

  // Ensure that if there is a stacked activity (not the last on the timeline),
  // we also show the next unstacked activity within the 3 visible items.
  const firstStackIndex = upcomingItems.findIndex((i) => i.type === 'stack');
  if (firstStackIndex !== -1 && firstStackIndex < upcomingItems.length - 1) {
    const nextUnstackedActivity = upcomingItems
      .slice(firstStackIndex + 1)
      .find((i) => i.type === 'activity');

    if (nextUnstackedActivity && !displayItems.some((i) => i.id === nextUnstackedActivity.id)) {
      if (displayItems.length < 3) {
        displayItems = [...displayItems, nextUnstackedActivity];
      } else {
        // Prefer to replace the last gap if present; otherwise replace the last item
        let replaceIndex = displayItems.length - 1;
        for (let r = displayItems.length - 1; r >= 0; r--) {
          if (displayItems[r].type === 'gap') {
            replaceIndex = r;
            break;
          }
        }
        displayItems = displayItems
          .map((itm, idx) => (idx === replaceIndex ? nextUnstackedActivity : itm))
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      }
    }
  }

  // Define a compact display range spanning only the visible items
  // Expand compact range slightly to avoid full-width rounding issues
  // Equal-width layout does not require explicit compact range
  // Kept for potential future proportional layout; not needed in equal-width layout
  // const compactRangeMinutes = Math.max(displayRangeEndMinutes - displayRangeStartMinutes, 15);

  // Helper: pretty label from HH:MM string
  const formatTimeLabel = (hhmm: string) => {
    const mins = timeToMinutes(hhmm);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return formatTimelineTime(h, m);
  };

  // Compact view does not render progress bar/line

  // No duration formatting needed in compact view

  // Unified interaction handler - all items open modals for consistency
  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'stack') {
      setSelectedStack(item.data as Task[]);
      setSelectedTimeSlot(item.startTime);
      setStackModalOpen(true);
    } else if (item.type === 'activity') {
      // For single activities, wrap in array for consistent modal behavior
      setSelectedStack([item.data as Task]);
      setSelectedTimeSlot(item.startTime);
      setStackModalOpen(true);
    } else if (item.type === 'gap') {
      // For gap clicks, we need to create a real gap in the database first since timeline gaps are synthetic
      // We'll create the gap on the fly and then open the modal
      handleCreateAndUtilizeGap(item);
    }
    onItemClick?.(item);
  };

  const getActivityColor = (item: TimelineItem) => {
    if (item.type === 'stack') {
      // Vibrant colors for stacked activities to make them stand out
      if (item.stackType === 'summary') {
        return 'bg-gradient-to-r from-orange-500/85 to-red-500/85'; // High-contrast for summary stacks
      }
      // Different colors based on stack reason
      if (item.stackReason === 'time_overlap') {
        return 'bg-gradient-to-r from-amber-500/85 to-orange-500/85'; // Amber for time overlaps
      }
      return 'bg-gradient-to-r from-blue-500/85 to-purple-500/85'; // Blue-purple for proximity groups
    }
    
    // Standard opacity for single activities
    const colorMap: { [key: string]: string } = {
      'text-red-400': 'bg-gradient-to-r from-red-500/80 to-red-600/80',
      'text-blue-400': 'bg-gradient-to-r from-blue-500/80 to-blue-600/80',
      'text-purple-400': 'bg-gradient-to-r from-purple-500/80 to-purple-600/80',
      'text-green-400': 'bg-gradient-to-r from-green-500/80 to-green-600/80',
      'text-yellow-400': 'bg-gradient-to-r from-yellow-500/80 to-yellow-600/80',
      'text-orange-400': 'bg-gradient-to-r from-orange-500/80 to-orange-600/80',
      'text-teal-400': 'bg-gradient-to-r from-teal-500/80 to-teal-600/80',
      'text-pink-400': 'bg-gradient-to-r from-pink-500/80 to-pink-600/80',
      'text-indigo-400': 'bg-gradient-to-r from-indigo-500/80 to-indigo-600/80',
    };
    
    return item.color ? colorMap[item.color] || 'bg-gradient-to-r from-slate-500/80 to-slate-600/80' : 'bg-gradient-to-r from-slate-500/80 to-slate-600/80';
  };

  // If outside work hours, show the banner instead of timeline
  if (showBanner) {
    return (
      <>
        <DayCompleteBanner 
          isBeforeWorkHours={isBeforeWorkHours}
          workStartTime={workStartTime}
          workEndTime={workEndTime}
        />
        
        {/* Activity Stack Modal - handles both single activities and stacks */}
        <ActivityStackModal
          isOpen={stackModalOpen}
          onClose={() => setStackModalOpen(false)}
          activities={selectedStack}
          timeSlot={selectedTimeSlot}
          onActivitySelect={(activity) => {
            setStackModalOpen(false);
            onTaskSelect?.(activity);
          }}
          onStartTimer={(activity) => {
            setStackModalOpen(false);
            onStartTimer?.(activity);
          }}
          stackReason={selectedStack.length === 1 ? 'single' : 
                      selectedStack.length > 1 ? 'visual_proximity' : undefined}
        />

        {/* Gap Utilization Modal */}
        <GapUtilizationModal
          isOpen={gapModalOpen}
          onClose={() => {
            setGapModalOpen(false);
            setSelectedGap(null);
          }}
          gap={selectedGap}
          existingTasks={tasks}
          onTaskCreated={(task) => {
            setGapModalOpen(false);
            setSelectedGap(null);
            onTaskCreated?.(task);
          }}
          userPreferences={userPreferences}
        />
      </>
    );
  }

  return (
    <>
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
        {/* Time labels for each of the three items, same level/style as header */}
        <div className="flex items-center justify-between mb-3 text-sm text-slate-300">
          {displayItems.slice(0, 3).map((it, idx) => (
            <div key={`lbl-${it.id}-${idx}`} className="flex-1 text-center font-medium">
              {formatTimeLabel(it.startTime)}
            </div>
          ))}
        </div>
        
        <div className="relative">
          {/* Compact Timeline Container with 3 equal-sized items */}
          <div className="relative h-12 mb-1 bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            {displayItems.slice(0, 3).map((item, idx) => {
              const displayCount = Math.min(displayItems.length, 3);
              const slotWidth = 100 / displayCount;
              const gutter = 1; // percent
              const widthPct = Math.max(slotWidth - gutter, 5);
              const leftPct = idx * slotWidth + gutter / 2;

              if (item.type === 'gap') {
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`absolute top-0 h-full transition-all duration-200 flex items-center justify-center group rounded-2xl bg-slate-600/25 hover:bg-slate-600/35 cursor-pointer border border-slate-600/30 z-10`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, margin: '0 1px' }}
                  >
                    <div className="flex items-center gap-1 text-slate-300 group-hover:text-slate-200 px-3 truncate">
                      <div className="w-2 h-2 bg-slate-400/60 rounded-full flex-shrink-0"></div>
                      <span className="text-xs">Gap</span>
                    </div>
                  </button>
                );
              }

              // activity or stack
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`absolute top-0 h-full px-3 ${getActivityColor(item)} rounded-2xl transition-all duration-200 hover:opacity-90 hover:scale-[1.02] flex items-center gap-2 z-20 shadow-lg border-2 border-white/20 mx-0.5`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, margin: '0 1px' }}
                >
                  {item.type === 'stack' ? (
                    <>
                      <div className="w-6 h-6 bg-white/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">{item.count}</span>
                      </div>
                      <span className="text-xs text-white font-medium truncate">{item.stackType === 'summary' ? 'tasks' : 'activities'}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                        {renderSafeIcon(item.icon || 'default')}
                      </div>
                      <span className="text-xs text-white font-medium truncate">{item.duration}m</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Activity Stack Modal - handles both single activities and stacks */}
      <ActivityStackModal
        isOpen={stackModalOpen}
        onClose={() => setStackModalOpen(false)}
        activities={selectedStack}
        timeSlot={selectedTimeSlot}
        onActivitySelect={(activity) => {
          setStackModalOpen(false);
          onTaskSelect?.(activity);
        }}
        onStartTimer={(activity) => {
          setStackModalOpen(false);
          onStartTimer?.(activity);
        }}
        stackReason={selectedStack.length === 1 ? 'single' : 
                    selectedStack.length > 1 ? 'visual_proximity' : undefined}
      />

      {/* Gap Utilization Modal */}
      <GapUtilizationModal
        isOpen={gapModalOpen}
        onClose={() => {
          setGapModalOpen(false);
          setSelectedGap(null);
        }}
        gap={selectedGap}
        existingTasks={tasks}
        onTaskCreated={(task) => {
          setGapModalOpen(false);
          setSelectedGap(null);
          onTaskCreated?.(task);
        }}
        userPreferences={userPreferences}
      />
    </>
  );
}