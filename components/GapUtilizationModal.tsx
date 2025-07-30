import { useState, useEffect } from 'react';
import { X, Clock, Calendar, Plus, ArrowRight, Zap, Sparkles, User, CheckSquare } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon, minutesToTime, timeToMinutes, combineDateAndTime, safeTimeToMinutes, extractTimeFromDateTime, calculateGapDuration } from '../utils/helpers';
import { generateUUID } from '../utils/uuid';
import { GapsAPI } from '../utils/gapsAPI';
import { supabase } from '../utils/supabase/client';
import { exploreAPI, calendarAPI } from '../utils/api';
import { toast } from 'sonner';

interface GapUtilizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  gap: TimeGap | null;
  existingTasks: Task[];
  onTaskCreated: (task: Task) => void;
  userPreferences?: UserPreferences;
}

interface SuitableActivity {
  id: string;
  title: string;
  category: string;
  duration: number; // in minutes
  color: string;
  icon: string;
  rating?: number;
  type: 'suggestion' | 'task';
  originalTask?: Task; // for existing tasks
}

export function GapUtilizationModal({
  isOpen,
  onClose,
  gap,
  existingTasks,
  onTaskCreated,
  userPreferences
}: GapUtilizationModalProps) {
  const [suitableActivities, setSuitableActivities] = useState<SuitableActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [selectedOption, setSelectedOption] = useState<'activities' | 'new-task' | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    category: 'Personal',
    duration: '',
    addToCalendar: false
  });
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isLoadingCalendarStatus, setIsLoadingCalendarStatus] = useState(true);

  useEffect(() => {
    if (isOpen && gap) {
      loadSuitableActivities();
      checkCalendarStatus();
    }
  }, [isOpen, gap]);

  const checkCalendarStatus = async () => {
    try {
      setIsLoadingCalendarStatus(true);
      const status = await calendarAPI.getStatus();
      setIsCalendarConnected(status.connected || false);
    } catch (error) {
      console.warn('Could not check calendar status:', error);
      setIsCalendarConnected(false);
    } finally {
      setIsLoadingCalendarStatus(false);
    }
  };

  const loadSuitableActivities = async () => {
    if (!gap) return;
    
    try {
      setIsLoadingActivities(true);
      
      const gapDurationMinutes = gap.duration_minutes || gap.duration || calculateGapDuration(gap.start_time, gap.end_time);
      console.log('🔍 [GapUtilizationModal] Loading activities for gap:', {
        gapId: gap.id,
        gapDuration: gapDurationMinutes,
        gapTime: `${gap.start_time} - ${gap.end_time}`
      });

      // Load suggestions from explore API
      let suggestions: SuitableActivity[] = [];
      try {
        const exploreActivities = await exploreAPI.get();
        
        suggestions = (exploreActivities || [])
          .filter((activity: any) => activity.duration && activity.duration <= gapDurationMinutes)
          .map((activity: any) => ({
            id: activity.id,
            title: activity.title,
            category: activity.category,
            duration: activity.duration,
            color: activity.color,
            icon: activity.icon,
            rating: activity.rating,
            type: 'suggestion' as const
          }));
      } catch (error) {
        console.warn('Could not load suggestions:', error);
      }

      // Filter existing tasks that can fit in the gap and are not completed
      const suitableTasks: SuitableActivity[] = existingTasks
        .filter(task => {
          // Parse duration from HH:MM:SS format
          const [hours, minutes] = task.duration.split(':').map(Number);
          const taskDurationMinutes = (hours * 60) + minutes;
          
          return taskDurationMinutes <= gapDurationMinutes && 
                 task.status !== 'completed' && 
                 !task.isCompleted &&
                 !task.is_completed;
        })
        .map(task => {
          const [hours, minutes] = task.duration.split(':').map(Number);
          const taskDurationMinutes = (hours * 60) + minutes;
          
          return {
            id: task.id,
            title: task.title,
            category: task.category,
            duration: taskDurationMinutes,
            color: task.iconColor,
            icon: task.icon,
            type: 'task' as const,
            originalTask: task
          };
        });

      // Combine and sort by duration (shorter tasks first)
      const allSuitable = [...suggestions, ...suitableTasks]
        .sort((a, b) => a.duration - b.duration);

      console.log('✅ [GapUtilizationModal] Found suitable activities:', {
        suggestions: suggestions.length,
        tasks: suitableTasks.length,
        total: allSuitable.length
      });

      setSuitableActivities(allSuitable);
    } catch (error) {
      console.error('Error loading suitable activities:', error);
      setSuitableActivities([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const createCalendarEvent = async (title: string, startDateTime: string, endDateTime: string, description?: string) => {
    if (!isCalendarConnected) return null;

    try {
      const result = await calendarAPI.createEvent({
        title,
        startDateTime,
        endDateTime,
        description: description || 'Scheduled activity from Gaply',
        location: ''
      });

      if (result.success) {
        console.log('✅ Calendar event created:', result.eventId);
        return result.eventId;
      }
      return null;
    } catch (error) {
      console.warn('Could not create calendar event:', error);
      toast.error('Failed to add to calendar', {
        description: 'Activity was scheduled but could not be added to calendar.',
      });
      return null;
    }
  };

  const scheduleActivityInGap = async (activity: SuitableActivity, addToCalendar: boolean = false) => {
    if (!gap) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Authentication required', {
          description: 'Please sign in to schedule activities.',
        });
        return;
      }

      let taskToSchedule: Task;

      if (activity.type === 'task' && activity.originalTask) {
        // Schedule existing task
        taskToSchedule = {
          ...activity.originalTask,
          status: 'scheduled' as const,
          dueDate: gap.date,
          dueTime: gap.start_time,
          scheduledGapId: gap.id
        };
      } else {
        // Create new task from suggestion
        taskToSchedule = {
          id: generateUUID(),
          title: activity.title,
          category: activity.category,
          duration: `00:${activity.duration.toString().padStart(2, '0')}:00`,
          status: 'scheduled' as const,
          iconColor: activity.color.replace('bg-', '').replace('text-', 'text-'),
          icon: activity.icon,
          notes: `Scheduled from gap utilization`,
          dueDate: gap.date,
          dueTime: gap.start_time,
          priority: 'Medium',
          energyLevel: 'Medium',
          isCompleted: false,
          is_completed: false,
          scheduledGapId: gap.id
        };
      }

      // Calculate task end time using safe time conversion
      const startMinutes = safeTimeToMinutes(gap.start_time);
      const endMinutes = startMinutes + activity.duration;
      const taskEndTime = minutesToTime(endMinutes);

      // Create calendar event if requested and calendar is connected
      let googleCalendarEventId = null;
      if (addToCalendar && isCalendarConnected && gap.date && gap.start_time) {
        const extractedStartTime = extractTimeFromDateTime(gap.start_time);
        const startDateTime = combineDateAndTime(gap.date, extractedStartTime);
        const endDateTime = combineDateAndTime(gap.date, taskEndTime);
        
        if (startDateTime && endDateTime) {
          googleCalendarEventId = await createCalendarEvent(
            activity.title,
            startDateTime,
            endDateTime,
            `${activity.category} activity scheduled via Gaply`
          );
        }
      }

      // Add calendar event ID to task if created
      if (googleCalendarEventId) {
        taskToSchedule.googleCalendarEventId = googleCalendarEventId;
      }

      // Only try to split the gap if it's a real gap (has a valid UUID, not synthetic)
      const isRealGap = gap.id && 
                       gap.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) &&
                       !gap.id.startsWith('synthetic-') &&
                       !gap.id.startsWith('timeline-gap-');
      
      if (isRealGap) {
        try {
          console.log('🔄 Splitting real gap for activity scheduling:', gap.id);
          // Split the gap using the gap logic API
          await GapsAPI.scheduleTaskInGap(
            gap.id,
            gap.start_time,
            taskEndTime,
            'user',
            session.access_token
          );
          console.log('✅ Gap splitting successful for activity');
        } catch (gapError) {
          console.warn('⚠️ Gap splitting failed, but continuing with task creation:', gapError);
          // Continue with task creation even if gap splitting fails
        }
      } else {
        console.log('📋 Synthetic/timeline gap detected for activity, skipping gap splitting', {
          gapId: gap.id,
          isSynthetic: gap.id.includes('synthetic') || gap.id.includes('timeline-gap')
        });
      }

      onTaskCreated(taskToSchedule);
      
      const successDescription = googleCalendarEventId 
        ? `Added to ${gap.start_time} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''} and Google Calendar`
        : `Added to ${gap.start_time} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''}`;
        
      toast.success(`Scheduled "${activity.title}"`, {
        description: successDescription,
      });
      
      onClose();
    } catch (error) {
      console.error('Error scheduling activity:', error);
      toast.error('Failed to schedule activity', {
        description: 'Could not schedule the activity. Please try again.',
      });
    }
  };

  const createNewTaskInGap = async () => {
    if (!gap || !newTaskForm.title.trim() || !newTaskForm.duration) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Authentication required', {
          description: 'Please sign in to create tasks.',
        });
        return;
      }

      // Parse duration and validate it fits in gap
      const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
      const taskDurationMinutes = (hours * 60) + minutes;
      const gapDurationMinutes = gap.duration_minutes || gap.duration || calculateGapDuration(gap.start_time, gap.end_time);

      if (taskDurationMinutes > gapDurationMinutes) {
        toast.error('Task too long', {
          description: `Task duration (${taskDurationMinutes}m) exceeds gap duration (${gapDurationMinutes}m).`,
        });
        return;
      }

      const categoryColors = {
        Personal: 'text-purple-400',
        Work: 'text-blue-400',
        Health: 'text-red-400',
        Learning: 'text-green-400',
        Chores: 'text-orange-400'
      };

      const newTask: Task = {
        id: generateUUID(),
        title: newTaskForm.title,
        category: newTaskForm.category,
        duration: newTaskForm.duration + ':00',
        status: 'scheduled' as const,
        iconColor: categoryColors[newTaskForm.category as keyof typeof categoryColors] || 'text-slate-400',
        icon: newTaskForm.category,
        notes: 'Created in gap utilization',
        dueDate: gap.date,
        dueTime: gap.start_time,
        priority: 'Medium',
        energyLevel: 'Medium',
        isCompleted: false,
        is_completed: false,
        scheduledGapId: gap.id
      };

      // Calculate task end time using safe time conversion
      const startMinutes = safeTimeToMinutes(gap.start_time);
      const endMinutes = startMinutes + taskDurationMinutes;
      const taskEndTime = minutesToTime(endMinutes);

      // Create calendar event if requested and calendar is connected
      let googleCalendarEventId = null;
      if (newTaskForm.addToCalendar && isCalendarConnected && gap.date && gap.start_time) {
        const extractedStartTime = extractTimeFromDateTime(gap.start_time);
        const startDateTime = combineDateAndTime(gap.date, extractedStartTime);
        const endDateTime = combineDateAndTime(gap.date, taskEndTime);
        
        if (startDateTime && endDateTime) {
          googleCalendarEventId = await createCalendarEvent(
            newTask.title,
            startDateTime,
            endDateTime,
            `${newTask.category} task created via Gaply`
          );
        }
      }

      // Add calendar event ID to task if created
      if (googleCalendarEventId) {
        newTask.googleCalendarEventId = googleCalendarEventId;
      }

      // Only try to split the gap if it's a real gap (has a valid UUID, not synthetic)
      const isRealGap = gap.id && 
                       gap.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) &&
                       !gap.id.startsWith('synthetic-') &&
                       !gap.id.startsWith('timeline-gap-');
      
      if (isRealGap) {
        try {
          console.log('🔄 Splitting real gap for new task:', gap.id);
          // Split the gap using the gap logic API
          await GapsAPI.scheduleTaskInGap(
            gap.id,
            gap.start_time,
            taskEndTime,
            'user',
            session.access_token
          );
          console.log('✅ Gap splitting successful for new task');
        } catch (gapError) {
          console.warn('⚠️ Gap splitting failed, but continuing with task creation:', gapError);
          // Continue with task creation even if gap splitting fails
        }
      } else {
        console.log('📋 Synthetic/timeline gap detected for new task, skipping gap splitting', {
          gapId: gap.id,
          isSynthetic: gap.id.includes('synthetic') || gap.id.includes('timeline-gap')
        });
      }

      onTaskCreated(newTask);
      
      const successDescription = googleCalendarEventId 
        ? `Added to ${gap.start_time} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''} and Google Calendar`
        : `Added to ${gap.start_time} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''}`;
        
      toast.success(`Created and scheduled "${newTask.title}"`, {
        description: successDescription,
      });
      
      onClose();
    } catch (error) {
      console.error('Error creating new task:', error);
      toast.error('Failed to create task', {
        description: 'Could not create and schedule the task. Please try again.',
      });
    }
  };

  const formatGapTime = (gap: TimeGap) => {
    const startTime = extractTimeFromDateTime(gap.start_time) || gap.start_time;
    const endTime = extractTimeFromDateTime(gap.end_time) || gap.end_time;
    
    if (!gap.date) return `${startTime} - ${endTime}`;
    
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
    
    return `${dateStr} • ${startTime} - ${endTime}`;
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}hr ${mins}m` : `${hours}hr`;
    }
    return `${mins}m`;
  };

  const resetForm = () => {
    setNewTaskForm({
      title: '',
      category: 'Personal',
      duration: '',
      addToCalendar: false
    });
    setSelectedOption(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !gap) return null;

  const gapDurationMinutes = gap.duration_minutes || gap.duration || calculateGapDuration(gap.start_time, gap.end_time);
  const suggestedActivities = suitableActivities.filter(a => a.type === 'suggestion');
  const suitableTasks = suitableActivities.filter(a => a.type === 'task');

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full bg-slate-900/95 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 max-h-[85vh] overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-slate-600 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div>
            <h3 className="text-xl text-white">Utilize Gap</h3>
            <p className="text-slate-400 text-sm">
              {formatGapTime(gap)} • {formatDuration(gapDurationMinutes)} available
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 pb-8 space-y-4 max-h-[calc(85vh-200px)] overflow-y-auto scroll-smooth ios-scroll android-scroll modal-scrollable" data-scrollable="true">
          {/* Gap Info */}
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">Available Time Slot</div>
                <div className="text-slate-400 text-sm">
                  {formatDuration(gapDurationMinutes)} to accomplish a task
                </div>
              </div>
              {/* Calendar Status Indicator */}
              {!isLoadingCalendarStatus && (
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 ${isCalendarConnected ? 'text-green-400' : 'text-slate-500'}`} />
                  <span className={`text-xs ${isCalendarConnected ? 'text-green-400' : 'text-slate-500'}`}>
                    {isCalendarConnected ? 'Calendar Connected' : 'Calendar Not Connected'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h4 className="text-white font-medium">How would you like to use this time?</h4>
            
            {/* Existing Activities Option */}
            <button
              onClick={() => setSelectedOption(selectedOption === 'activities' ? null : 'activities')}
              className={`w-full bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border transition-all ${
                selectedOption === 'activities' 
                  ? 'border-blue-500/50 bg-blue-500/10' 
                  : 'border-slate-700/50 hover:bg-slate-700/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium">Use existing activities</div>
                    <div className="text-slate-400 text-sm">
                      {isLoadingActivities ? 'Loading activities...' : 
                       suitableActivities.length > 0 ? `${suitableActivities.length} activities fit this gap` : 'No suitable activities found'}
                    </div>
                  </div>
                </div>
                <ArrowRight className={`w-5 h-5 text-slate-400 transition-transform ${
                  selectedOption === 'activities' ? 'rotate-90' : ''
                }`} />
              </div>
            </button>

            {/* Activities List */}
            {selectedOption === 'activities' && (
              <div className="ml-4 space-y-3 max-h-64 overflow-y-auto">
                {isLoadingActivities ? (
                  <div className="text-center py-4">
                    <div className="text-slate-400">Loading activities...</div>
                  </div>
                ) : suitableActivities.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-slate-400 text-sm">
                      No activities found that fit in this {formatDuration(gapDurationMinutes)} gap.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Calendar Toggle for Activities */}
                    {isCalendarConnected && (
                      <div className="bg-slate-700/30 rounded-xl p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            <span className="text-white text-sm">Add to Google Calendar</span>
                          </div>
                          <button
                            onClick={() => setNewTaskForm(prev => ({ ...prev, addToCalendar: !prev.addToCalendar }))}
                            className={`w-11 h-6 rounded-full transition-colors ${
                              newTaskForm.addToCalendar ? 'bg-blue-600' : 'bg-slate-600'
                            }`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                              newTaskForm.addToCalendar ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Suggestions Section */}
                    {suggestedActivities.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                          <Sparkles className="w-4 h-4" />
                          Suggestions ({suggestedActivities.length})
                        </div>
                        {suggestedActivities.map((activity) => (
                          <button
                            key={`suggestion-${activity.id}`}
                            onClick={() => scheduleActivityInGap(activity, newTaskForm.addToCalendar)}
                            className="w-full bg-slate-700/40 rounded-xl p-3 text-left hover:bg-slate-600/40 transition-colors border border-slate-600/30"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 ${activity.color} rounded-full flex items-center justify-center`}>
                                  {renderSafeIcon(activity.icon, 'w-4 h-4')}
                                </div>
                                <div>
                                  <div className="text-white text-sm font-medium">{activity.title}</div>
                                  <div className="text-slate-400 text-xs">
                                    {activity.category} • {formatDuration(activity.duration)}
                                    {activity.rating && (
                                      <>
                                        {' • '}
                                        <span className="text-yellow-400">★ {activity.rating}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Zap className="w-4 h-4 text-purple-400" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* My Tasks Section */}
                    {suitableTasks.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                          <User className="w-4 h-4" />
                          My Tasks ({suitableTasks.length})
                        </div>
                        {suitableTasks.map((activity) => (
                          <button
                            key={`task-${activity.id}`}
                            onClick={() => scheduleActivityInGap(activity, newTaskForm.addToCalendar)}
                            className="w-full bg-slate-700/40 rounded-xl p-3 text-left hover:bg-slate-600/40 transition-colors border border-slate-600/30"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 ${activity.color.replace('text-', 'bg-').replace('-400', '-500/20')} rounded-full flex items-center justify-center`}>
                                  {renderSafeIcon(activity.icon, 'w-4 h-4')}
                                </div>
                                <div>
                                  <div className="text-white text-sm font-medium">{activity.title}</div>
                                  <div className="text-slate-400 text-xs">
                                    {activity.category} • {formatDuration(activity.duration)}
                                  </div>
                                </div>
                              </div>
                              <Zap className="w-4 h-4 text-blue-400" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            
            {/* Create New Task Option */}
            <button
              onClick={() => setSelectedOption(selectedOption === 'new-task' ? null : 'new-task')}
              className={`w-full bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border transition-all ${
                selectedOption === 'new-task' 
                  ? 'border-green-500/50 bg-green-500/10' 
                  : 'border-slate-700/50 hover:bg-slate-700/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Plus className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium">Create new task</div>
                    <div className="text-slate-400 text-sm">
                      Create a custom task for this time slot
                    </div>
                  </div>
                </div>
                <ArrowRight className={`w-5 h-5 text-slate-400 transition-transform ${
                  selectedOption === 'new-task' ? 'rotate-90' : ''
                }`} />
              </div>
            </button>

            {/* New Task Form */}
            {selectedOption === 'new-task' && (
              <div className="ml-4 space-y-3">
                <div className="bg-slate-700/40 rounded-xl p-4 space-y-3">
                  {/* Task Title */}
                  <div>
                    <label className="text-slate-300 text-sm font-medium mb-1 block">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={newTaskForm.title}
                      onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter task title"
                      className="w-full bg-slate-800/60 border border-slate-600/50 text-white placeholder:text-slate-400 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>

                  {/* Category and Duration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-300 text-sm font-medium mb-1 block">
                        Category
                      </label>
                      <select
                        value={newTaskForm.category}
                        onChange={(e) => setNewTaskForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full bg-slate-800/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Work">Work</option>
                        <option value="Health">Health</option>
                        <option value="Learning">Learning</option>
                        <option value="Chores">Chores</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-300 text-sm font-medium mb-1 block">
                        Duration
                      </label>
                      <input
                        type="time"
                        value={newTaskForm.duration}
                        onChange={(e) => setNewTaskForm(prev => ({ ...prev, duration: e.target.value }))}
                        className="w-full bg-slate-800/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Calendar Toggle */}
                  {isCalendarConnected && (
                    <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-600/30">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <div>
                          <div className="text-white text-sm font-medium">Add to Google Calendar</div>
                          <div className="text-slate-400 text-xs">Create a calendar event for this task</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setNewTaskForm(prev => ({ ...prev, addToCalendar: !prev.addToCalendar }))}
                        className={`w-11 h-6 rounded-full transition-colors ${
                          newTaskForm.addToCalendar ? 'bg-blue-600' : 'bg-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          newTaskForm.addToCalendar ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  )}

                  {/* Validation Note */}
                  {newTaskForm.duration && (
                    <div className="text-xs text-slate-400">
                      {(() => {
                        const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
                        const taskDurationMinutes = (hours * 60) + minutes;
                        if (taskDurationMinutes > gapDurationMinutes) {
                          return (
                            <span className="text-red-400">
                              Task duration ({formatDuration(taskDurationMinutes)}) exceeds gap duration ({formatDuration(gapDurationMinutes)})
                            </span>
                          );
                        }
                        return `Task will use ${formatDuration(taskDurationMinutes)} of ${formatDuration(gapDurationMinutes)} available`;
                      })()}
                    </div>
                  )}

                  {/* Create Button */}
                  <button
                    onClick={createNewTaskInGap}
                    disabled={!newTaskForm.title.trim() || !newTaskForm.duration || (() => {
                      if (!newTaskForm.duration) return true;
                      const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
                      const taskDurationMinutes = (hours * 60) + minutes;
                      return taskDurationMinutes > gapDurationMinutes;
                    })()}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl py-2 text-sm font-medium transition-colors"
                  >
                    {newTaskForm.addToCalendar && isCalendarConnected 
                      ? 'Create Task & Add to Calendar' 
                      : 'Create & Schedule Task'
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}