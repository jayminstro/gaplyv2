import { useState, useEffect, useRef } from 'react';
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

  // Generate date tabs (7 days in past + today + 7 days forward = 15 total)
  const dateTabs = Array.from({ length: 15 }, (_, index) => {
    // Calculate date: -7 to +7 (index 7 is today)
    const date = addDays(new Date(), index - 7);
    const isToday = index === 7;
    
    return {
      date: startOfDay(date),
      label: format(date, 'EEE'), // Day of week (Mon, Tue, Wed, etc.)
      isToday: isToday
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
            {balanceStatus}
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
                const todayIndex = 7; // Today is at index 7
                const todayButton = el.children[todayIndex] as HTMLElement;
                if (todayButton) {
                  const containerWidth = el.offsetWidth;
                  const buttonWidth = todayButton.offsetWidth;
                  const scrollLeft = todayButton.offsetLeft - (containerWidth / 2) + (buttonWidth / 2);
                  el.scrollTo({ left: scrollLeft, behavior: 'smooth' });
                  el.dataset.scrolled = 'true';
                }
              }
            }}
          >
            {dateTabs.map((tab, index) => (
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
                setSelectedDate(startOfDay(new Date()));
                setTimeout(scrollToCurrentTime, 150);
              }}
              className="px-3 py-2 bg-slate-700/30 hover:bg-slate-600/30 text-slate-300 hover:text-white rounded-2xl transition-all whitespace-nowrap text-sm font-medium min-w-fit touch-manipulation flex-shrink-0 border border-slate-600/30 hover:border-slate-500/50"
              type="button"
              title="Jump to today and current time"
            >
              Now
            </button>
          </div>
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