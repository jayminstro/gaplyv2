import { useState, useEffect } from 'react';
import { X, Clock, Calendar, Plus, ArrowRight, Zap } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon, minutesToTime, timeToMinutes } from '../utils/helpers';
import { generateUUID } from '../utils/uuid';
import { GapsAPI } from '../utils/gapsAPI';
import { supabase } from '../utils/supabase/client';
import { toast } from 'sonner';
import { calendarService } from '../utils/calendar/index';

interface ActivitySchedulingModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: any; // The activity from the discover data
  onTaskCreated: (task: Task) => void;
  userPreferences?: UserPreferences;
}

export function ActivitySchedulingModal({
  isOpen,
  onClose,
  activity,
  onTaskCreated,
  userPreferences
}: ActivitySchedulingModalProps) {
  const [availableGaps, setAvailableGaps] = useState<TimeGap[]>([]);
  const [isLoadingGaps, setIsLoadingGaps] = useState(true);
  const [selectedOption, setSelectedOption] = useState<'gap' | 'task' | null>(null);
  const [suggestions, setSuggestions] = useState<{ start_time: string; end_time: string }[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAvailableGaps();
    }
  }, [isOpen]);

  const loadAvailableGaps = async () => {
    try {
      setIsLoadingGaps(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('No access token for loading gaps');
        setAvailableGaps([]);
        return;
      }
      
      // Get today's date for gap filtering
      const today = new Date().toISOString().split('T')[0];
      const gaps = await GapsAPI.getGapsForDate(today, session.access_token);
      
      // Filter gaps that can fit this activity
      const activityDuration = activity.duration; // in minutes
      console.log('🔍 [ActivitySchedulingModal] Filtering gaps:', {
        totalGaps: gaps.length,
        activityDuration,
        gaps: gaps.map(g => ({ 
          id: g.id, 
          duration_minutes: g.duration_minutes,
          start_time: g.start_time, 
          end_time: g.end_time 
        }))
      });
      
      const suitableGaps = gaps.filter(gap => {
        const gapDuration = gap.duration_minutes;
        return gapDuration >= activityDuration;
      });
      
      console.log('✅ [ActivitySchedulingModal] Suitable gaps found:', suitableGaps.length);
      setAvailableGaps(suitableGaps);
    } catch (error) {
      console.error('Error loading gaps:', error);
      setAvailableGaps([]);
    } finally {
      setIsLoadingGaps(false);
    }
  };

  const scheduleInGap = async (gap: TimeGap) => {
    try {
      // Validate against calendar busy
      if (userPreferences?.show_device_calendar_busy) {
        const valid = await calendarService.validateScheduling({ start_time: gap.start_time, end_time: minutesToTime(timeToMinutes(gap.start_time) + activity.duration) }, gap.date, userPreferences);
        if (!valid.canSchedule) {
          // Build suggestions from current day's gaps
          try {
            const alt = await calendarService.suggestAlternatives({ start_time: gap.start_time, end_time: minutesToTime(timeToMinutes(gap.start_time) + activity.duration) }, gap.date, availableGaps, userPreferences!);
            setSuggestions((alt || []).slice(0, 3).map(a => ({ start_time: a.start_time, end_time: a.end_time })));
          } catch {}
          toast.error('Time conflicts with calendar busy', { description: 'Showing alternative slots.' });
          return;
        }
      }
      // Create a scheduled task
      const newTask: Task = {
        id: generateUUID(),
        title: activity.title,
        category: activity.category,
        duration: `00:${activity.duration.toString().padStart(2, '0')}:00`,
        status: 'scheduled' as const,
        iconColor: activity.color.replace('bg-', '').replace('text-', 'text-'),
        icon: activity.icon,
        notes: `Scheduled from ${activity.category} activities`,
        dueDate: gap.date,
        dueTime: gap.start_time,
        priority: 'Medium',
        energyLevel: 'Medium',
        isCompleted: false,
        is_completed: false
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Authentication required', {
          description: 'Please sign in to schedule activities.',
        });
        return;
      }

      // Calculate task end time
      const startMinutes = timeToMinutes(gap.start_time);
      const endMinutes = startMinutes + activity.duration;
      const taskEndTime = minutesToTime(endMinutes);

      // Schedule task in gap using new API
      const result = await GapsAPI.scheduleTaskInGap(
        gap.id,
        gap.start_time,
        taskEndTime,
        newTask
      );

      if (result.success) {
        onTaskCreated(result.task);
        
        toast.success(`Scheduled "${activity.title}"`, {
          description: `Added to ${gap.start_time} - ${gap.end_time} on ${gap.date}`,
        });
        
        onClose();
      }
    } catch (error: unknown) {
      console.error('Error scheduling activity:', error);
      toast.error('Failed to schedule activity', {
        description: error instanceof Error ? error.message : 'Could not schedule the activity. Please try again.',
      });
    }
  };

  const createAsTask = async () => {
    try {
      console.log('🆕 [ActivitySchedulingModal] Creating task from activity:', {
        activityTitle: activity.title,
        activityDuration: activity.duration,
        activityCategory: activity.category
      });
      
      // Create a regular task (not scheduled) with correct structure
      const newTask: Task = {
        id: generateUUID(),
        title: activity.title,
        category: activity.category,
        duration: `00:${activity.duration.toString().padStart(2, '0')}:00`,
        status: 'draft' as const,
        iconColor: activity.color.replace('bg-', '').replace('text-', 'text-'),
        icon: activity.icon,
        notes: `Added from ${activity.category} activities`,
        energyLevel: 'Medium',
        priority: 'Medium',
        isCompleted: false,
        is_completed: false
      };

      console.log('📝 [ActivitySchedulingModal] Created task object:', newTask);
      
      onTaskCreated(newTask);
      
      console.log('✅ [ActivitySchedulingModal] Task creation callback completed');
      
      toast.success(`Added "${activity.title}"`, {
        description: `Added to your tasks in ${activity.category}`,
      });
      
      onClose();
    } catch (error) {
      console.error('❌ [ActivitySchedulingModal] Error creating task:', {
        error,
        errorMessage: error.message,
        activity: {
          title: activity.title,
          category: activity.category,
          duration: activity.duration
        }
      });
      
      toast.error('Failed to add activity', {
        description: 'Could not add the activity to your tasks. Please try again.',
      });
    }
  };

  const formatGapTime = (gap: TimeGap) => {
    const date = new Date(gap.date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let dateStr = '';
    if (date.toDateString() === today.toDateString()) {
      dateStr = 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      dateStr = 'Tomorrow';
    } else {
      dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    
    return `${dateStr} • ${gap.start_time} - ${gap.end_time}`;
  };

  const formatGapDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}hr ${mins}m` : `${hours}hr`;
    }
    return `${mins}m`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full bg-slate-900/95 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 max-h-[80vh] overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-slate-600 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div>
            <h3 className="text-xl text-white">Add Activity</h3>
            <p className="text-slate-400 text-sm">
              {activity.title} • {activity.duration} min
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 pb-8 space-y-4 max-h-96 overflow-y-auto">
          {/* Activity Preview */}
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 ${activity.color} rounded-full flex items-center justify-center`}>
                {renderSafeIcon(activity.icon)}
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">{activity.title}</div>
                <div className="text-slate-400 text-sm flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>{activity.category} • {activity.duration} min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h4 className="text-white font-medium">How would you like to add this?</h4>
            
            {/* Schedule in Gap Option */}
            <button
              onClick={() => setSelectedOption(selectedOption === 'gap' ? null : 'gap')}
              className={`w-full bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border transition-all ${
                selectedOption === 'gap' 
                  ? 'border-blue-500/50 bg-blue-500/10' 
                  : 'border-slate-700/50 hover:bg-slate-700/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium">Schedule in available time</div>
                    <div className="text-slate-400 text-sm">
                      {isLoadingGaps ? 'Loading gaps...' : 
                       availableGaps.length > 0 ? `${availableGaps.length} available slots` : 'No suitable gaps found'}
                    </div>
                  </div>
                </div>
                <ArrowRight className={`w-5 h-5 text-slate-400 transition-transform ${
                  selectedOption === 'gap' ? 'rotate-90' : ''
                }`} />
              </div>
            </button>

            {/* Gap Options */}
            {selectedOption === 'gap' && (
              <div className="ml-4 space-y-2 max-h-48 overflow-y-auto">
                {suggestions && suggestions.length > 0 && (
                  <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl text-amber-200 text-xs">
                    <div className="font-medium mb-2">Suggestions</div>
                    <div className="grid grid-cols-2 gap-2">
                      {suggestions.map((s, idx) => (
                        <div key={idx} className="px-2 py-1 bg-amber-800/30 rounded">
                          {s.start_time} - {s.end_time}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isLoadingGaps ? (
                  <div className="text-center py-4">
                    <div className="text-slate-400">Loading available times...</div>
                  </div>
                ) : availableGaps.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-slate-400 text-sm">
                      No gaps found that can fit this {activity.duration}-minute activity.
                    </div>
                  </div>
                ) : (
                  availableGaps.map((gap) => (
                    <button
                      key={gap.id}
                      onClick={() => scheduleInGap(gap)}
                      className="w-full bg-slate-700/40 rounded-xl p-3 text-left hover:bg-slate-600/40 transition-colors border border-slate-600/30"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white text-sm font-medium">
                            {formatGapTime(gap)}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {formatGapDuration(gap.duration_minutes || 0)} available
                          </div>
                        </div>
                        <Zap className="w-4 h-4 text-blue-400" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
            
            {/* Add as Task Option */}
            <button
              onClick={createAsTask}
              className="w-full bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50 hover:bg-slate-700/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                  <Plus className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-left">
                  <div className="text-white font-medium">Add as unscheduled task</div>
                  <div className="text-slate-400 text-sm">Add to your task list to schedule later</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}