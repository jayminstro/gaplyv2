import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, startOfDay, isSameDay, isAfter, isBefore } from 'date-fns';
import { PlannerTimeline } from './PlannerTimeline';
import { Task, TimeGap, UserPreferences } from '../types/index';

interface PlannerContentProps {
  globalTasks: Task[];
  gaps: TimeGap[];
  onTaskOpen: (task: Task) => void;
  onGapUtilize: (gap: TimeGap) => void;
  userPreferences?: UserPreferences;
}

function PlannerContent({ 
  globalTasks, 
  gaps, 
  onTaskOpen, 
  onGapUtilize,
  userPreferences 
}: PlannerContentProps) {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  // Generate date tabs (today + next 4 days)
  const dateTabs = Array.from({ length: 5 }, (_, index) => {
    const date = addDays(new Date(), index);
    return {
      date: startOfDay(date),
      label: index === 0 ? 'Today' : 
             index === 1 ? 'Tomorrow' : 
             format(date, 'MMM d'),
      isToday: index === 0
    };
  });

  // Filter tasks for selected date
  const selectedDateTasks = globalTasks.filter(task => {
    if (!task.dueDate) return false;
    const taskDate = startOfDay(new Date(task.dueDate));
    return isSameDay(taskDate, selectedDate);
  });

  // Filter gaps for selected date (assuming gaps have a date field)
  const selectedDateGaps = gaps.filter(gap => {
    if (!gap.date) return false;
    const gapDate = startOfDay(new Date(gap.date));
    return isSameDay(gapDate, selectedDate);
  });

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
        const selectedDateStr = selectedDate.toISOString().split('T')[0];
        startTime = new Date(`${selectedDateStr}T${gapStart}`);
      }
      
      if (gapEnd.includes('T')) {
        endTime = new Date(gapEnd);
      } else {
        const selectedDateStr = selectedDate.toISOString().split('T')[0];
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
  const totalGaps = workingHoursGaps.length;
  const completedTasks = selectedDateTasks.filter(task => task.status === 'completed').length;
  const totalTasks = selectedDateTasks.length;
  
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
          const selectedDateStr = selectedDate.toISOString().split('T')[0];
          startTime = new Date(`${selectedDateStr}T${gapStart}`);
        }
        
        if (gapEnd.includes('T')) {
          endTime = new Date(gapEnd);
        } else {
          const selectedDateStr = selectedDate.toISOString().split('T')[0];
          endTime = new Date(`${selectedDateStr}T${gapEnd}`);
        }
        
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
        if (durationMinutes > 0 && durationMinutes <= 24 * 60) {
          totalMinutes += durationMinutes;
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
  
  const getBalanceStatus = () => {
    if (totalTasks === 0) return 'No tasks';
    if (completedTasks === totalTasks) return 'Complete';
    if (totalGaps > totalTasks - completedTasks) return 'Balanced';
    if (totalGaps === totalTasks - completedTasks) return 'Tight';
    return 'Overloaded';
  };

  const balanceStatus = getBalanceStatus();
  const remainingGaps = Math.max(0, totalGaps - (totalTasks - completedTasks));
  const gapTimeText = formatGapTime();

  return (
    <div className="flex-1 p-6 pb-0">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-2 text-white">
          Planner
        </h1>
        <p className="text-slate-400 text-base">
          {balanceStatus}
          {gapTimeText && (
            <span> • {gapTimeText} left</span>
          )}
        </p>
      </div>

      {/* Date Navigation */}
      <div className="mb-8">
        <div 
          className="flex items-center gap-4 overflow-x-auto ios-scroll android-scroll pb-2" 
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {dateTabs.map((tab) => (
            <button
              key={tab.date.toISOString()}
              onClick={() => setSelectedDate(tab.date)}
              className={`
                px-4 py-2 rounded-2xl transition-all whitespace-nowrap text-sm font-medium min-w-fit touch-manipulation
                ${isSameDay(selectedDate, tab.date)
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 active:bg-slate-600/50'
                }
              `}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto ios-scroll android-scroll no-bounce" data-scrollable="true">
        <PlannerTimeline
          tasks={selectedDateTasks}
          gaps={selectedDateGaps}
          selectedDate={selectedDate}
          currentTime={currentTime}
          onTaskOpen={onTaskOpen}
          onGapUtilize={onGapUtilize}
          userPreferences={userPreferences}
        />
      </div>
    </div>
  );
}

export { PlannerContent };