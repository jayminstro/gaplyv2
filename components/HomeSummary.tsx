import { useState, useEffect } from 'react';
import { Task, TimeGap } from '../types/index';
import { extractTimeFromDateTime } from '../utils/helpers';

interface HomeSummaryProps {
  globalTasks: Task[];
  gaps: TimeGap[];
  userName?: string;
}

export function HomeSummary({ globalTasks, gaps, userName: _userName }: HomeSummaryProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    freeTime: '--',
    scheduledTasks: '--',
    nextFreeSlot: '--'
  });

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime(); // Initial call
    
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate stats whenever time or data changes
  useEffect(() => {
    calculateStats();
  }, [currentTime, globalTasks, gaps]);

  const calculateStats = () => {
    const now = currentTime;
    const today = now.toISOString().split('T')[0]; // Use ISO date format for consistency

    // Filter gaps for today - handle both date field and derive from times
    const todayGaps = gaps.filter(gap => {
      // First try to use the date field if available
      if (gap.date) {
        return gap.date === today;
      }
      
      // Fallback: check if gap times are for today (assuming they're in local time)
      const gapDate = new Date().toISOString().split('T')[0]; // Assume today for gaps without date
      return gapDate === today;
    });

    console.log('HomeSummary calculation:', {
      now: now.toISOString(),
      today,
      todayGaps: todayGaps.length,
      totalGaps: gaps.length,
      gapsWithDate: gaps.filter(g => g.date).length
    });

    // Calculate free time
    const freeTimeMinutes = calculateFreeTime(todayGaps, now);
    const freeTimeDisplay = formatDuration(freeTimeMinutes);

    // Count scheduled tasks for today
    const scheduledTasksCount = countScheduledTasks(globalTasks, today);

    // Find next free slot
    const nextFreeSlot = findNextFreeSlot(todayGaps, now);

    console.log('HomeSummary results:', {
      freeTimeMinutes,
      freeTimeDisplay,
      scheduledTasksCount,
      nextFreeSlot
    });

    setStats({
      freeTime: freeTimeDisplay,
      scheduledTasks: scheduledTasksCount.toString(),
      nextFreeSlot: nextFreeSlot
    });
  };

  const calculateFreeTime = (todayGaps: TimeGap[], now: Date): number => {
    let totalFreeMinutes = 0;
    const today = now.toISOString().split('T')[0];

    for (const gap of todayGaps) {
      // Extract clean time strings from potentially ISO datetime strings
      const startTimeStr = extractTimeFromDateTime(gap.start_time);
      const endTimeStr = extractTimeFromDateTime(gap.end_time);
      
      if (!startTimeStr || !endTimeStr) {
        console.warn('⚠️ Invalid gap times: could not extract time from gap data:', {
          id: gap.id,
          start_time: gap.start_time,
          end_time: gap.end_time
        });
        continue;
      }

      // Create proper date objects from gap times
      const startTime = new Date(`${gap.date || today}T${startTimeStr}:00`);
      const endTime = new Date(`${gap.date || today}T${endTimeStr}:00`);

      // Validate that we have valid dates
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        console.warn('⚠️ Invalid gap times: could not create valid dates from:', {
          id: gap.id,
          startTimeStr,
          endTimeStr,
          date: gap.date || today
        });
        continue;
      }

      // If the gap has already passed, ignore it
      if (endTime <= now) {
        continue;
      }

      // If we're currently in this gap, count only remaining time
      if (startTime <= now && now < endTime) {
        const remainingMs = endTime.getTime() - now.getTime();
        totalFreeMinutes += Math.floor(remainingMs / (1000 * 60));
      }
      // If the gap is in the future, count the full duration
      else if (startTime > now) {
        // Use the duration_minutes field if available, otherwise calculate
        const gapDuration = gap.duration_minutes;
        if (gapDuration > 0) {
          totalFreeMinutes += gapDuration;
        } else {
          const durationMs = endTime.getTime() - startTime.getTime();
          totalFreeMinutes += Math.floor(durationMs / (1000 * 60));
        }
      }
    }

    return totalFreeMinutes;
  };

  const findNextFreeSlot = (todayGaps: TimeGap[], now: Date): string => {
    const today = now.toISOString().split('T')[0];

    // Check if we're currently in a free time slot
    for (const gap of todayGaps) {
      // Extract clean time strings from potentially ISO datetime strings
      const startTimeStr = extractTimeFromDateTime(gap.start_time);
      const endTimeStr = extractTimeFromDateTime(gap.end_time);
      
      if (!startTimeStr || !endTimeStr) {
        continue; // Skip invalid gaps
      }

      const startTime = new Date(`${gap.date || today}T${startTimeStr}:00`);
      const endTime = new Date(`${gap.date || today}T${endTimeStr}:00`);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        continue; // Skip invalid gaps
      }

      if (startTime <= now && now < endTime) {
        // We're currently in free time, show "Now"
        return 'Now';
      }
    }

    // Find the next future gap
    const futureGaps = todayGaps
      .map(gap => {
        const startTimeStr = extractTimeFromDateTime(gap.start_time);
        if (!startTimeStr) return null;
        
        const startTime = new Date(`${gap.date || today}T${startTimeStr}:00`);
        return {
          ...gap,
          startTime
        };
      })
      .filter((gap): gap is TimeGap & { startTime: Date } => !!gap && !isNaN(gap.startTime.getTime()) && gap.startTime > now)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    if (futureGaps.length > 0) {
      return formatTime(futureGaps[0].startTime);
    }

    // No free time left today
    return '--';
  };

  const countScheduledTasks = (tasks: Task[], today: string): number => {
    return tasks.filter(task => {
      if (!task.dueDate) return false;

      const isToday = task.dueDate === today;

      // Count activities due today that are not completed
      return isToday && !task.isCompleted && !task.is_completed;
    }).length;
  };

  const formatDuration = (minutes: number): string => {
    if (minutes <= 0) return '--';

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `${remainingMinutes}m`;
    } else if (remainingMinutes === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${remainingMinutes}m`;
    }
  };

  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 text-center border border-slate-700/50 touch-manipulation h-[84px] flex flex-col justify-center overflow-hidden">
        <div className="[font-size:clamp(16px,3.8vw,24px)] mb-1 font-mono leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{stats.freeTime}</div>
        <div className="text-slate-400 text-sm truncate">Free</div>
      </div>
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 text-center border border-slate-700/50 touch-manipulation h-[84px] flex flex-col justify-center overflow-hidden">
        <div className="[font-size:clamp(16px,3.8vw,24px)] mb-1 font-mono leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{stats.scheduledTasks}</div>
        <div className="text-slate-400 text-sm truncate">Scheduled</div>
      </div>
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 text-center border border-slate-700/50 touch-manipulation h-[84px] flex flex-col justify-center overflow-hidden">
        <div className="[font-size:clamp(16px,3.8vw,24px)] mb-1 font-mono leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{stats.nextFreeSlot}</div>
        <div className="text-slate-400 text-sm truncate">Next Free Slot</div>
      </div>
    </div>
  );
}