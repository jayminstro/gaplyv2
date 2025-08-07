import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, startOfDay, isSameDay, isAfter, isBefore } from 'date-fns';
import { PlannerTimeline } from './PlannerTimeline';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { GapsAPI } from '../utils/gapsAPI';

interface PlannerContentProps {
  globalTasks: Task[];
  gaps: TimeGap[];
  onTaskOpen: (task: Task) => void;
  onGapUtilize: (gap: TimeGap) => void;
  userPreferences?: UserPreferences;
  session?: any;
  storageManager?: any; // Add storage manager prop
}

function PlannerContent({ 
  globalTasks, 
  gaps, 
  onTaskOpen, 
  onGapUtilize,
  userPreferences,
  session,
  storageManager
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

  // Track which dates we've already attempted to create gaps for
  const [processedDates, setProcessedDates] = useState<Set<string>>(new Set());

  // Ensure gaps exist for the selected date and all future dates in rolling window
  useEffect(() => {
    const ensureGapsForAllFutureDates = async () => {
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
      const selectedDateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
      
      // Debug: Log the dates being processed
      console.log(`🔍 Processing date: ${selectedDateStr}, Today: ${today}`);
      
      // Prevent infinite loops by tracking processed dates
      if (processedDates.has(selectedDateStr)) {
        console.log(`⏭️ Date ${selectedDateStr} already processed, skipping`);
        return;
      }
      
      // Don't create gaps for past dates (except today)
      if (selectedDateStr < today) {
        console.log(`⏭️ Skipping past date: ${selectedDateStr}`);
        setProcessedDates(prev => new Set([...prev, selectedDateStr]));
        return;
      }
      
      // Always create gaps for today if they don't exist
      const isToday = selectedDateStr === today;
      if (isToday) {
        console.log(`📅 Processing today's date: ${selectedDateStr}`);
      }
      
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
            // Don't update gaps state here - let the main app handle it
            // The gaps will be saved to storage and loaded by the main app flow
          }
        } catch (error) {
          console.error('❌ Error creating gaps for selected date:', error);
        }
      } else {
        // If gaps exist, mark the date as processed
        setProcessedDates(prev => new Set([...prev, selectedDateStr]));
      }
      
      // Now ensure all future dates in the rolling window have gaps
      await ensureAllFutureDatesHaveGaps();
    };
    
    const ensureAllFutureDatesHaveGaps = async () => {
      try {
        const { GapLogic } = await import('../utils/gapLogic');
        const { window_start, window_end } = GapLogic.calculateRollingWindow();
        const today = new Date().toLocaleDateString('en-CA');
        
        console.log(`🔄 Ensuring gaps for all future dates in rolling window: ${window_start} to ${window_end}`);
        
        // Get all dates from today to the end of the rolling window
        const startDate = new Date(today);
        const endDate = new Date(window_end);
        const datesToProcess: string[] = [];
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const dateStr = date.toLocaleDateString('en-CA');
          
          // Skip if already processed
          if (processedDates.has(dateStr)) {
            continue;
          }
          
          // Check if it's a working day
          const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
          const { normalizeWorkingDays } = await import('../utils/gapLogic');
          const workingDays = normalizeWorkingDays(userPreferences.calendar_working_days);
          if (!workingDays.includes(dayOfWeek)) {
            console.log(`⏸️ Skipping non-working day: ${dateStr} (${dayOfWeek})`);
            setProcessedDates(prev => new Set([...prev, dateStr]));
            continue;
          }
          
          // Check if we already have gaps for this date
          const existingGaps = gaps.filter(gap => gap.date === dateStr);
          if (existingGaps.length > 0) {
            console.log(`✅ Already have ${existingGaps.length} gaps for ${dateStr}`);
            setProcessedDates(prev => new Set([...prev, dateStr]));
            continue;
          }
          
          datesToProcess.push(dateStr);
        }
        
        console.log(`📅 Found ${datesToProcess.length} future dates that need gaps`);
        
        // Create gaps for all future dates in parallel (but limit concurrency)
        const batchSize = 3; // Process 3 dates at a time to avoid overwhelming the system
        for (let i = 0; i < datesToProcess.length; i += batchSize) {
          const batch = datesToProcess.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (dateStr) => {
            try {
              console.log(`🔄 Creating gaps for future date: ${dateStr}`);
              
              // Mark as processed to prevent duplicate processing
              setProcessedDates(prev => new Set([...prev, dateStr]));
              
              // Try to get existing gaps first
              let gapsForDate: TimeGap[] = [];
              try {
                gapsForDate = await GapsAPI.getGapsForDate(dateStr, session.access_token);
              } catch (fetchError) {
                // Ignore fetch errors, will create local gaps
              }
              
              if (gapsForDate.length === 0) {
                // Create local fallback gaps
                gapsForDate = await GapsAPI.createLocalFallbackGaps(
                  dateStr, 
                  userPreferences, 
                  session?.user?.id || 'local-user', 
                  storageManager
                );
                console.log(`✅ Created ${gapsForDate.length} gaps for future date ${dateStr}`);
              } else {
                console.log(`✅ Found ${gapsForDate.length} existing gaps for future date ${dateStr}`);
              }
            } catch (error) {
              console.error(`❌ Error creating gaps for future date ${dateStr}:`, error);
            }
          }));
          
          // Small delay between batches to avoid overwhelming the system
          if (i + batchSize < datesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log(`✅ Finished ensuring gaps for all future dates`);
      } catch (error) {
        console.error('❌ Error ensuring gaps for future dates:', error);
      }
    };
    
    ensureGapsForAllFutureDates();
  }, [selectedDate, session?.access_token, userPreferences, processedDates, gaps]);

  // Reset processed dates when user changes
  useEffect(() => {
    setProcessedDates(new Set());
  }, [session?.access_token]);

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

  // Filter gaps for selected date (assuming gaps have a date field)
  const selectedDateGaps = gaps.filter(gap => {
    if (!gap.date) return false;
    const gapDate = startOfDay(new Date(gap.date));
    return isSameDay(gapDate, selectedDate);
  });
  
  // Debug: Log gap information
  console.log(`🔍 Gap Debug - Total gaps: ${gaps.length}, Selected date: ${selectedDate.toLocaleDateString('en-CA')}, Gaps for selected date: ${selectedDateGaps.length}`);
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