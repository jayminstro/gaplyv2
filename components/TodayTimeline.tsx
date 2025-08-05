import { useState, useRef, useEffect } from 'react';
import { Clock, Users, User, Briefcase, Heart, BookOpen, Home } from 'lucide-react';
import { ActivityStackModal } from './ActivityStackModal';
import { GapUtilizationModal } from './GapUtilizationModal';
import { DayCompleteBanner } from './DayCompleteBanner';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { 
  renderSafeIcon, 
  formatTimelineTime, 
  timeToMinutes, 
  minutesToTime,
  safeTimeToMinutes,
  extractTimeFromDateTime,
  calculateGapDuration
} from '../utils/helpers';
import { GapLogic } from '../utils/gapLogic';
import { GapsAPI } from '../utils/gapsAPI';
import { supabase } from '../utils/supabase/client';

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
  gaps, 
  currentTime = new Date(), 
  userPreferences,
  onItemClick,
  onTaskSelect,
  onStartTimer,
  onTaskCreated
}: TodayTimelineProps) {
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Task[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [gapModalOpen, setGapModalOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<TimeGap | null>(null);

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
  
  // Calculate real-time display for middle position - show actual current time if within timeline
  const getCurrentTimeDisplay = () => {
    if (currentMinutes >= timelineStartMinutes && currentMinutes <= timelineEndMinutes) {
      // Show current time if it's within the visible timeline
      const hours = actualCurrentTime.getHours();
      const minutes = actualCurrentTime.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } else {
      // Show middle time of timeline range
      const middleMinutes = Math.floor((timelineStartMinutes + timelineEndMinutes) / 2);
      const middleHour = Math.floor(middleMinutes / 60);
      const middleMinute = middleMinutes % 60;
      return formatTimelineTime(middleHour, middleMinute);
    }
  };

  // Time-collision configuration
  const timeOverlapThresholdMinutes = 5; // Activities that actually overlap in time
  const visualProximityThresholdMinutes = 45; // Activities within 45 minutes get grouped to reduce visual clutter
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
      
      // Only include activities within the timeline's time range
      const isInTimelineRange = taskMinutes >= timelineStartMinutes && taskMinutes < timelineEndMinutes;
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
        // Check for both time overlap and visual proximity
        const shouldGroup = currentStack.some(stackActivity => {
          // 1. Check for actual time overlap
          const overlaps = (currentActivity.startMinutes < stackActivity.endMinutes && 
                           currentActivity.endMinutes > stackActivity.startMinutes);
          
          // 2. Check for close time proximity (within threshold)
          const timeGap = Math.min(
            Math.abs(currentActivity.startMinutes - stackActivity.endMinutes),
            Math.abs(stackActivity.startMinutes - currentActivity.endMinutes)
          );
          
          const isTimeOverlap = overlaps || timeGap <= timeOverlapThresholdMinutes;
          const isVisuallyClose = timeGap <= visualProximityThresholdMinutes;
          
          return isTimeOverlap || isVisuallyClose;
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
            // Check if any activities actually overlap
            const hasTimeOverlap = currentStack.some((act1, idx) => 
              currentStack.some((act2, idx2) => 
                idx !== idx2 && 
                act1.startMinutes < act2.endMinutes && 
                act1.endMinutes > act2.startMinutes
              )
            );
            stackReason = hasTimeOverlap ? 'time_overlap' : 'visual_proximity';
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
        const hasTimeOverlap = currentStack.some((act1, idx) => 
          currentStack.some((act2, idx2) => 
            idx !== idx2 && 
            act1.startMinutes < act2.endMinutes && 
            act1.endMinutes > act2.startMinutes
          )
        );
        stackReason = hasTimeOverlap ? 'time_overlap' : 'visual_proximity';
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

  // Calculate current time progress within the visible timeline
  const calculateCurrentProgress = (): number => {
    if (currentMinutes < timelineStartMinutes) return 0;
    if (currentMinutes > timelineEndMinutes) return 100;
    return ((currentMinutes - timelineStartMinutes) / totalTimelineMinutes) * 100;
  };
  
  const currentProgress = calculateCurrentProgress();

  // Format gap duration for display
  const formatGapDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}hr ${mins}m` : `${hours}hr`;
    }
    return `${mins}m`;
  };

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
        {/* Time Markers */}
        <div className="flex items-center justify-between mb-4 text-sm text-slate-300">
          <span>{startTimeStr}</span>
          <div className="flex items-center gap-1">
            <div className={`w-1 h-1 rounded-full ${
              currentMinutes >= timelineStartMinutes && currentMinutes <= timelineEndMinutes 
                ? 'bg-orange-400' 
                : 'bg-slate-400'
            }`}></div>
            <span className={
              currentMinutes >= timelineStartMinutes && currentMinutes <= timelineEndMinutes 
                ? 'text-orange-300 font-medium' 
                : 'text-slate-300'
            }>
              {getCurrentTimeDisplay()}
            </span>
            <div className={`w-1 h-1 rounded-full ${
              currentMinutes >= timelineStartMinutes && currentMinutes <= timelineEndMinutes 
                ? 'bg-orange-400' 
                : 'bg-slate-400'
            }`}></div>
          </div>
          <span>{endTimeStr}</span>
        </div>
        
        <div className="relative">
          {/* Timeline Container - consistent rounded-2xl and overflow hidden */}
          <div className="relative h-12 mb-3 bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Gap Blocks - background layer with proper z-index */}
            {gapBlocks.map((gap) => {
              const isExpanded = expandedGapId === gap.id;
              // Check if this gap is obscured by any activities
              const isObscured = activityItems.some(activity => {
                const activityEnd = activity.position + activity.width;
                const gapEnd = gap.position + gap.width;
                return !(activity.position >= gapEnd || activityEnd <= gap.position);
              });
              
              return (
                <button
                  key={gap.id}
                  onClick={() => !isObscured && handleItemClick(gap)}
                  disabled={isObscured}
                  className={`absolute top-0 h-full transition-all duration-200 flex items-center justify-center group border-0 z-10 rounded-2xl ${
                    isObscured 
                      ? 'bg-slate-600/15 cursor-default' 
                      : 'bg-slate-600/25 hover:bg-slate-600/35 cursor-pointer border border-slate-600/30'
                  }`}
                  style={{ 
                    left: `${gap.position}%`,
                    width: `${gap.width}%`,
                    margin: '0 1px' // Add small margin for separation
                  }}
                >
                  {!isObscured && (
                    <div className="flex items-center gap-1 text-slate-300 group-hover:text-slate-200 px-3 truncate">
                      {isExpanded ? (
                        <span className="text-xs font-medium">{formatGapDuration(gap.duration)}</span>
                      ) : (
                        <>
                          <div className="w-2 h-2 bg-slate-400/60 rounded-full flex-shrink-0"></div>
                          <span className="text-xs">Gap</span>
                        </>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
            
            {/* Activity Pills - foreground layer with consistent sizing */}
            {activityItems.map((activity) => {
              return (
                <button
                  key={activity.id}
                  onClick={() => handleItemClick(activity)}
                  className={`absolute top-0 h-full px-3 ${getActivityColor(activity)} rounded-2xl transition-all duration-200 hover:opacity-90 hover:scale-[1.02] flex items-center gap-2 z-20 shadow-lg border-2 border-white/20 mx-0.5`}
                  style={{ 
                    left: `${Math.max(0, Math.min(activity.position, 100 - activity.width))}%`,
                    width: `${activity.width}%`,
                    margin: '0 1px' // Add small margin for separation
                  }}
                >
                  {activity.type === 'stack' ? (
                    <>
                      <div className="w-6 h-6 bg-white/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">
                          {activity.count}
                        </span>
                      </div>
                      <span className="text-xs text-white font-medium truncate">
                        {activity.stackType === 'summary' ? 'tasks' : 'activities'}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                        {renderSafeIcon(activity.icon || 'default')}
                      </div>
                      <span className="text-xs text-white font-medium truncate">{activity.duration}m</span>
                    </>
                  )}
                </button>
              );
            })}
            
            {/* Current Time Indicator - highest z-index */}
            {currentProgress >= 0 && currentProgress <= 100 && (
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-orange-400 z-30 rounded-full"
                style={{ left: `${currentProgress}%` }}
              >
                <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-orange-400 rounded-full border-2 border-white shadow-sm"></div>
              </div>
            )}
          </div>
          
          {/* Timeline Progress Bar */}
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-400 to-pink-400 rounded-full transition-all duration-1000"
              style={{ width: `${currentProgress}%` }}
            ></div>
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