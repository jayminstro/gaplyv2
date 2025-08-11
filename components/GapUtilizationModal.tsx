import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Calendar, Plus, ArrowRight, Zap, Sparkles, User } from 'lucide-react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { renderSafeIcon, minutesToTime, timeToMinutes, combineDateAndTime, extractTimeFromDateTime } from '../utils/helpers';
import { generateUUID } from '../utils/uuid';
// Gaps are computed locally; no server scheduling needed
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
  onTaskCreated
}: GapUtilizationModalProps) {
  const [suitableActivities, setSuitableActivities] = useState<SuitableActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [selectedOption, setSelectedOption] = useState<'activities' | 'new-task' | 'activity-config' | null>(null);
  const [activitiesTab, setActivitiesTab] = useState<'suggestions' | 'tasks'>('suggestions');
  const [showAllActivities, setShowAllActivities] = useState<boolean>(false);
  const [activityStartTime, setActivityStartTime] = useState<string>('');
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    category: 'Personal',
    duration: '',
    addToCalendar: false
  });
  const [newTaskStartTime, setNewTaskStartTime] = useState<string>('');
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isLoadingCalendarStatus, setIsLoadingCalendarStatus] = useState(true);
  // Track current time locally so modal updates every minute
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Compute dynamic window based on current time (only for today and current hour)
  const getDynamicGapWindow = (g: TimeGap | null): { start: string; end: string; minutes: number } => {
    if (!g) return { start: '', end: '', minutes: 0 };
    const startDateTime = new Date(`${g.date}T${extractTimeFromDateTime(g.start_time) || g.start_time}`);
    const endDateTime = new Date(`${g.date}T${extractTimeFromDateTime(g.end_time) || g.end_time}`);
    const isToday = new Date(g.date).toDateString() === new Date().toDateString();
    let displayStart = startDateTime;
    let displayEnd = endDateTime;
    if (isToday && currentTime >= startDateTime && currentTime < endDateTime) {
      // Limit to current hour
      const hourStart = new Date(currentTime);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);
      displayStart = currentTime > startDateTime ? currentTime : startDateTime;
      displayEnd = endDateTime < hourEnd ? endDateTime : hourEnd;
    }
    const minutes = Math.max(0, Math.round((displayEnd.getTime() - displayStart.getTime()) / (1000 * 60)));
    return { start: minutesToTime(displayStart.getHours() * 60 + displayStart.getMinutes()), end: minutesToTime(displayEnd.getHours() * 60 + displayEnd.getMinutes()), minutes };
  };
  
  // Local state for minute input values (allows empty values temporarily)
  const [activityMinuteInput, setActivityMinuteInput] = useState<string>('');
  const [newTaskMinuteInput, setNewTaskMinuteInput] = useState<string>('');
  const [selectedActivity, setSelectedActivity] = useState<SuitableActivity | null>(null);
  const [activityDuration, setActivityDuration] = useState<number>(0);

  const handleSelectActivity = (activity: SuitableActivity) => {
    setSelectedActivity(activity);
    setActivityDuration(activity.duration);
    const defaultStart = gap?.start_time || '00:00';
    setActivityStartTime(defaultStart);
    setActivityMinuteInput(parseTime(defaultStart).minutes.toString());
    setSelectedOption('activity-config');
  };

  // Validation functions for time constraints
  const validateStartTime = (startTime: string, durationMinutes: number = 0): { isValid: boolean; message: string; constrainedTime: string } => {
    if (!gap) return { isValid: false, message: 'No gap available', constrainedTime: '' };

    // Use dynamic window when applicable
    const dynamic = getDynamicGapWindow(gap);
    const effectiveStartStr = dynamic.start || gap.start_time;
    const effectiveEndStr = dynamic.end || gap.end_time;
    const gapStartMinutes = timeToMinutes(effectiveStartStr);
    const gapEndMinutes = timeToMinutes(effectiveEndStr);
    const startMinutes = timeToMinutes(startTime);
    
    // Check if start time is before gap start
    if (startMinutes < gapStartMinutes) {
      return { 
        isValid: false, 
        message: `Start time must be after ${effectiveStartStr}`, 
        constrainedTime: effectiveStartStr 
      };
    }
    
    // Check if start time + duration exceeds gap end
    if (startMinutes + durationMinutes > gapEndMinutes) {
      const latestStart = getLatestStartTime(durationMinutes);
      return { 
        isValid: false, 
        message: `Start time + duration exceeds gap end. Latest start: ${latestStart}`, 
        constrainedTime: latestStart 
      };
    }
    
    return { isValid: true, message: '', constrainedTime: startTime };
  };

  // Deprecated time input handlers removed (switched to minute-only input UI)

  // Generate valid time options for the time inputs
  // Unused legacy helpers removed

  // Calculate the latest possible start time for a given duration
  const getLatestStartTime = (durationMinutes: number): string => {
    if (!gap) return '';
    const dynamic = getDynamicGapWindow(gap);
    const effectiveStartStr = dynamic.start || gap.start_time;
    const effectiveEndStr = dynamic.end || gap.end_time;
    const gapEndMinutes = timeToMinutes(effectiveEndStr);
    const latestStartMinutes = gapEndMinutes - durationMinutes;
    const gapStartMinutes = timeToMinutes(effectiveStartStr);
    
    // Ensure we don't go before gap start
    if (latestStartMinutes < gapStartMinutes) {
      return gap.start_time;
    }
    
    return minutesToTime(latestStartMinutes);
  };

  // Parse time into hours and minutes
  const parseTime = (timeStr: string): { hours: number; minutes: number } => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
  };

  // Generate minute options for a specific hour within the gap
  // Unused legacy minute options helper removed

  // Handle minute change for activities
  const handleActivityMinuteChange = (newMinute: number) => {
    if (!gap) return;
    
    const currentHour = parseTime(activityStartTime).hours;
    const newTime = `${currentHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
    
    // Find the longest activity duration to validate against
    const maxDuration = Math.max(...suitableActivities.map(a => a.duration), 0);
    const validation = validateStartTime(newTime, maxDuration);
    
    if (validation.isValid) {
      setActivityStartTime(newTime);
    } else {
      // Auto-correct to valid time and show toast
      setActivityStartTime(validation.constrainedTime);
      toast.warning('Time adjusted', {
        description: validation.message,
      });
    }
  };

  // Handle minute change for new tasks
  const handleNewTaskMinuteChange = (newMinute: number) => {
    if (!gap || !newTaskForm.duration) return;
    
    const currentHour = parseTime(newTaskStartTime).hours;
    const newTime = `${currentHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
    
    const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
    const taskDurationMinutes = (hours * 60) + minutes;
    const validation = validateStartTime(newTime, taskDurationMinutes);
    
    if (validation.isValid) {
      setNewTaskStartTime(newTime);
    } else {
      // Auto-correct to valid time and show toast
      setNewTaskStartTime(validation.constrainedTime);
      toast.warning('Time adjusted', {
        description: validation.message,
      });
    }
  };

  // Handle minute input change for activities (with validation)
  const handleActivityMinuteInputChange = (inputValue: string) => {
    if (!gap) return;
    
    // Update local input value (allows empty)
    setActivityMinuteInput(inputValue);
    
    // Allow empty input temporarily
    if (inputValue === '') {
      return;
    }
    
    const minute = parseInt(inputValue, 10);
    if (isNaN(minute) || minute < 0 || minute > 59) return;
    
    handleActivityMinuteChange(minute);
  };

  // Handle minute input change for new tasks (with validation)
  const handleNewTaskMinuteInputChange = (inputValue: string) => {
    if (!gap) return;
    
    // Update local input value (allows empty)
    setNewTaskMinuteInput(inputValue);
    
    // Allow empty input temporarily
    if (inputValue === '') {
      return;
    }
    
    const minute = parseInt(inputValue, 10);
    if (isNaN(minute) || minute < 0 || minute > 59) return;
    
    handleNewTaskMinuteChange(minute);
  };

  // Handle minute input blur for activities (final validation)
  const handleActivityMinuteBlur = (inputValue: string) => {
    if (!gap) return;
    
    let minute: number;
    
    if (inputValue === '') {
      // If input is empty, use the current minute value
      minute = parseTime(activityStartTime).minutes;
    } else {
      minute = parseInt(inputValue, 10);
      if (isNaN(minute)) {
        minute = parseTime(activityStartTime).minutes;
      }
    }
    
    // Clamp to valid range
    minute = Math.max(0, Math.min(59, minute));
    
    // Validate against gap constraints
    const currentHour = parseTime(activityStartTime).hours;
    const newTime = `${currentHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    const maxDuration = Math.max(...suitableActivities.map(a => a.duration), 0);
    const validation = validateStartTime(newTime, maxDuration);
    
    if (validation.isValid) {
      setActivityStartTime(newTime);
      setActivityMinuteInput(minute.toString());
    } else {
      setActivityStartTime(validation.constrainedTime);
      setActivityMinuteInput(parseTime(validation.constrainedTime).minutes.toString());
      toast.warning('Time adjusted', {
        description: validation.message,
      });
    }
  };

  // Handle minute input blur for new tasks (final validation)
  const handleNewTaskMinuteBlur = (inputValue: string) => {
    if (!gap) return;
    
    let minute: number;
    
    if (inputValue === '') {
      // If input is empty, use the current minute value
      minute = parseTime(newTaskStartTime).minutes;
    } else {
      minute = parseInt(inputValue, 10);
      if (isNaN(minute)) {
        minute = parseTime(newTaskStartTime).minutes;
      }
    }
    
    // Clamp to valid range
    minute = Math.max(0, Math.min(59, minute));
    
    // Validate against gap constraints (use 0 duration if not set yet)
    const currentHour = parseTime(newTaskStartTime).hours;
    const newTime = `${currentHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    let taskDurationMinutes = 0;
    if (newTaskForm.duration) {
      const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
      taskDurationMinutes = (hours * 60) + minutes;
    }
    
    const validation = validateStartTime(newTime, taskDurationMinutes);
    
    if (validation.isValid) {
      setNewTaskStartTime(newTime);
      setNewTaskMinuteInput(minute.toString());
    } else {
      setNewTaskStartTime(validation.constrainedTime);
      setNewTaskMinuteInput(parseTime(validation.constrainedTime).minutes.toString());
      toast.warning('Time adjusted', {
        description: validation.message,
      });
    }
  };

  useEffect(() => {
    if (isOpen && gap) {
      loadSuitableActivities();
      checkCalendarStatus();
      const dynamic = getDynamicGapWindow(gap);
      const defaultStart = dynamic.start || gap.start_time;
      setActivityStartTime(defaultStart);
      setNewTaskStartTime(defaultStart);
      // Initialize minute input values
      setActivityMinuteInput(parseTime(defaultStart).minutes.toString());
      setNewTaskMinuteInput(parseTime(defaultStart).minutes.toString());
      // Ensure consistent initial state regardless of entry point (Today vs Planner)
      setSelectedOption(null);
      setActivitiesTab('suggestions');
      setShowAllActivities(false);
    }
  }, [isOpen, gap, currentTime]);

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
      
      const dynamic = getDynamicGapWindow(gap);
      const gapDurationMinutes = dynamic.minutes || gap.duration_minutes;
      console.log('🔍 [GapUtilizationModal] Loading activities for gap:', {
        gapId: gap.id,
        gapDuration: gapDurationMinutes,
        gapTime: `${dynamic.start || gap.start_time} - ${dynamic.end || gap.end_time}`
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
      const chosenStart = activityStartTime || gap.start_time;
      
      // Validate start time using our validation function
      const validation = validateStartTime(chosenStart, activity.duration);
      if (!validation.isValid) {
        toast.error('Invalid start time', {
          description: validation.message,
        });
        return;
      }
      
      // Calculate end time for the task
      const startMinutes = timeToMinutes(chosenStart);
      const endMinutes = startMinutes + activity.duration;

      let taskStartTime = chosenStart;
      let taskEndTime: string = minutesToTime(endMinutes);

      if (activity.type === 'task' && activity.originalTask) {
        // Schedule existing task
        taskToSchedule = {
          ...activity.originalTask,
          status: 'scheduled' as const,
          dueDate: gap.date,
          dueTime: taskStartTime,
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
          dueTime: taskStartTime,
          priority: 'Medium',
          energyLevel: 'Medium',
          isCompleted: false,
          is_completed: false,
          scheduledGapId: gap.id
        };
      }

      // Create calendar event if requested and calendar is connected
      let googleCalendarEventId = null;
      if (addToCalendar && isCalendarConnected && gap.date && taskStartTime) {
        const extractedStartTime = extractTimeFromDateTime(taskStartTime);
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

      // Local-only: update task and notify caller; UI will recompute the day's gaps
      onTaskCreated(taskToSchedule);
      const successDescription = googleCalendarEventId 
        ? `Added to ${taskStartTime} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''} and Google Calendar`
        : `Added to ${taskStartTime} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''}`;
      toast.success(`Scheduled "${activity.title}"`, { description: successDescription });
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
      const gapDurationMinutes = gap.duration_minutes;

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
        dueTime: newTaskStartTime || gap.start_time,
        priority: 'Medium',
        energyLevel: 'Medium',
        isCompleted: false,
        is_completed: false,
        scheduledGapId: gap.id
      };

      // Calculate and validate against gap window
      const taskStartTime = newTaskStartTime || gap.start_time;
      
      // Validate start time using our validation function
      const validation = validateStartTime(taskStartTime, taskDurationMinutes);
      if (!validation.isValid) {
        toast.error('Invalid start time', {
          description: validation.message,
        });
        return;
      }
      
      // Calculate end time for the task
      const startMinutes = timeToMinutes(taskStartTime);
      const endMinutes = startMinutes + taskDurationMinutes;
      const taskEndTime = minutesToTime(endMinutes);

      // Create calendar event if requested and calendar is connected
      let googleCalendarEventId = null;
      if (newTaskForm.addToCalendar && isCalendarConnected && gap.date && taskStartTime) {
        const extractedStartTime = extractTimeFromDateTime(taskStartTime);
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

      // Local-only: update task and notify caller; UI will recompute the day's gaps
      onTaskCreated(newTask);
      const successDescription = googleCalendarEventId 
        ? `Added to ${taskStartTime} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''} and Google Calendar`
        : `Added to ${taskStartTime} - ${taskEndTime} ${gap.date ? `on ${gap.date}` : ''}`;
      toast.success(`Created and scheduled "${newTask.title}"`, { description: successDescription });
      onClose();
    } catch (error) {
      console.error('Error creating new task:', error);
      toast.error('Failed to create task', {
        description: 'Could not create and schedule the task. Please try again.',
      });
    }
  };

  const formatGapTime = (gap: TimeGap) => {
    const dynamic = getDynamicGapWindow(gap);
    const startTime = dynamic.start || extractTimeFromDateTime(gap.start_time) || gap.start_time;
    const endTime = dynamic.end || extractTimeFromDateTime(gap.end_time) || gap.end_time;
    
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
    const dynamic = getDynamicGapWindow(gap);
    const defaultStart = dynamic.start || gap?.start_time || '';
    setActivityStartTime(defaultStart);
    setNewTaskStartTime(defaultStart);
    setSelectedOption(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !gap) return null;

  const dynamicWindow = getDynamicGapWindow(gap);
  const gapDurationMinutes = dynamicWindow.minutes || gap.duration_minutes;
  const suggestedActivities = suitableActivities.filter(a => a.type === 'suggestion');
  const suitableTasks = suitableActivities.filter(a => a.type === 'task');

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-end pointer-events-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full bg-slate-900/95 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 max-h-[85vh] overflow-y-auto">
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
        <div className="px-6 pb-8 space-y-4 scroll-smooth ios-scroll android-scroll modal-scrollable" data-scrollable="true">
          {/* Gap Info */}
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">Gap</div>
                <div className="text-slate-400 text-sm">
                  {formatDuration(gapDurationMinutes)} to accomplish an activity
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
              onClick={() => {
                if (selectedOption === 'activities') {
                  setSelectedOption(null);
                } else {
                  setShowAllActivities(false);
                  setActivitiesTab('suggestions');
                  setSelectedOption('activities');
                }
              }}
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
              <div className="ml-4 space-y-3">
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
                        <div className="bg-slate-700/30 rounded-xl p-3">
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

                      {/* Tabs */}
                      <div className="mt-3">
                        <div className="flex gap-2 bg-slate-800/40 p-1 rounded-xl border border-slate-700/50 w-fit mx-auto">
                          <button
                            onClick={() => { setActivitiesTab('suggestions'); setShowAllActivities(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              activitiesTab === 'suggestions' ? 'bg-slate-700/60 text-white' : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Suggestions</span>
                          </button>
                          <button
                            onClick={() => { setActivitiesTab('tasks'); setShowAllActivities(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              activitiesTab === 'tasks' ? 'bg-slate-700/60 text-white' : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            <User className="w-4 h-4" />
                            <span>My Tasks</span>
                          </button>
                        </div>
                      </div>

                      {/* Tab Content */}
                      <div className="mt-3 space-y-2">
                        {(() => {
                          const activitiesForTab = activitiesTab === 'suggestions' ? suggestedActivities : suitableTasks;
                          if (activitiesForTab.length === 0) {
                            return (
                              <div className="text-center py-4">
                                <div className="text-slate-400 text-sm">
                                  {activitiesTab === 'suggestions' ? 'No suggestions fit this gap.' : 'No tasks fit this gap.'}
                                </div>
                              </div>
                            );
                          }
                          const visibleItems = showAllActivities ? activitiesForTab : activitiesForTab.slice(0, 3);
                          return (
                            <>
                              {visibleItems.map((activity) => (
                                <button
                                  key={`${activity.type}-${activity.id}`}
                                  onClick={() => handleSelectActivity(activity)}
                                  className="w-full bg-slate-700/40 rounded-xl p-3 text-left hover:bg-slate-600/40 transition-colors border border-slate-600/30"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 ${activity.type === 'task' ? activity.color.replace('text-', 'bg-').replace('-400', '-500/20') : activity.color} rounded-full flex items-center justify-center`}>
                                        {renderSafeIcon(activity.icon)}
                                      </div>
                                      <div>
                                        <div className="text-white text-sm font-medium">{activity.title}</div>
                                        <div className="text-slate-400 text-xs">
                                          {activity.category} • {formatDuration(activity.duration)}
                                          {activity.rating && (
                                            <>
                                              {' '}
                                              • <span className="text-yellow-400">★ {activity.rating}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <Zap className={`w-4 h-4 ${activity.type === 'task' ? 'text-blue-400' : 'text-purple-400'}`} />
                                  </div>
                                </button>
                              ))}
                              {activitiesForTab.length > 3 && (
                                <div className="pt-1">
                                  <button
                                    onClick={() => setShowAllActivities(!showAllActivities)}
                                    className="w-full text-center text-slate-300 hover:text-white text-sm"
                                  >
                                    {showAllActivities ? 'Show less' : `Show all ${activitiesForTab.length}`}
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
              </div>
            )}
            {selectedOption === 'activity-config' && (
              <div className="ml-4 space-y-3">
                <div className="bg-slate-700/40 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-white font-medium">Configure Activity</h5>
                    <button
                      onClick={() => setSelectedOption('activities')}
                      className="text-slate-400 hover:text-white text-sm"
                    >
                      ← Back to activities
                    </button>
                  </div>

                  {/* Selected Activity Display */}
                  {selectedActivity && (
                    <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-600/30">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${selectedActivity.color || 'bg-slate-500/20'} rounded-full flex items-center justify-center`}>
                          {renderSafeIcon(selectedActivity.icon)}
                        </div>
                        <div>
                          <div className="text-white font-medium">{selectedActivity.title}</div>
                          <div className="text-slate-400 text-sm">
                            {selectedActivity.category} • {formatDuration(activityDuration || selectedActivity.duration)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Duration Configuration */}
                  {selectedActivity && (
                    <div>
                      <label className="text-slate-300 text-sm font-medium mb-1 block">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        value={activityDuration || selectedActivity.duration}
                        onChange={(e) => setActivityDuration(Math.max(1, Math.min(gapDurationMinutes, Number(e.target.value) || 0)))}
                        min={1}
                        max={gapDurationMinutes}
                        step={1}
                        className="w-32 bg-slate-800/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        Max: {formatDuration(gapDurationMinutes)}
                      </div>
                    </div>
                  )}

                  {/* Start time selector */}
                  <div>
                    <label className="text-slate-300 text-sm font-medium mb-1 block">Start at</label>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-700/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm flex items-center justify-center">
                        {parseTime(activityStartTime).hours.toString().padStart(2, '0')}
                      </div>
                      <span className="text-white text-lg">:</span>
                      <input
                        type="number"
                        value={activityMinuteInput}
                        onChange={(e) => handleActivityMinuteInputChange(e.target.value)}
                        onBlur={(e) => handleActivityMinuteBlur(e.target.value)}
                        min="0"
                        max="59"
                        step="1"
                        placeholder="00"
                        className="w-20 bg-slate-800/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none text-center"
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Hour is fixed • Enter any minute (00-59)
                    </div>
                     <div className="text-xs text-slate-500 mt-1">
                       Available: {dynamicWindow.start || gap.start_time} - {dynamicWindow.end || gap.end_time}
                     </div>
                    {selectedActivity && (() => {
                      const duration = activityDuration || selectedActivity.duration;
                      const validation = validateStartTime(activityStartTime, duration);
                      const latestStart = getLatestStartTime(duration);
                      if (!validation.isValid) {
                        return (
                          <div className="text-xs text-orange-400 mt-1">⚠️ {validation.message}</div>
                        );
                      }
                      return (
                        <div className="text-xs text-green-400 mt-1">✓ Latest start: {latestStart}</div>
                      );
                    })()}
                  </div>

                  {/* Calendar Toggle */}
                  {isCalendarConnected && (
                    <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-600/30">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <div>
                          <div className="text-white text-sm font-medium">Add to Google Calendar</div>
                          <div className="text-slate-400 text-xs">Create a calendar event for this activity</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setNewTaskForm(prev => ({ ...prev, addToCalendar: !prev.addToCalendar }))}
                        className={`w-11 h-6 rounded-full transition-colors ${newTaskForm.addToCalendar ? 'bg-blue-600' : 'bg-slate-600'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${newTaskForm.addToCalendar ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  )}

                  {/* Schedule Button */}
                  <button
                    onClick={() => {
                      if (!selectedActivity) return;
                      const configured: SuitableActivity = { ...selectedActivity, duration: activityDuration || selectedActivity.duration };
                      scheduleActivityInGap(configured, newTaskForm.addToCalendar);
                    }}
                    disabled={(() => {
                      if (!selectedActivity) return true;
                      const duration = activityDuration || selectedActivity.duration;
                      const validation = validateStartTime(activityStartTime, duration);
                      return !validation.isValid || duration <= 0 || duration > gapDurationMinutes;
                    })()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-medium transition-colors"
                  >
                    Schedule Activity
                  </button>
                </div>
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

                  {/* Start time for new task */}
                  <div className="bg-slate-700/30 rounded-xl p-3 mb-3">
                    <label className="text-slate-300 text-sm font-medium mb-1 block">Start at</label>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-700/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm flex items-center justify-center">
                        {parseTime(newTaskStartTime).hours.toString().padStart(2, '0')}
                      </div>
                      <span className="text-white text-lg">:</span>
                      <input
                        type="number"
                        value={newTaskMinuteInput}
                        onChange={(e) => handleNewTaskMinuteInputChange(e.target.value)}
                        onBlur={(e) => handleNewTaskMinuteBlur(e.target.value)}
                        min="0"
                        max="59"
                        step="1"
                        placeholder="00"
                        className="w-20 bg-slate-800/60 border border-slate-600/50 text-white rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none text-center"
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Hour is fixed • Enter any minute (00-59)
                    </div>
                     <div className="text-xs text-slate-500 mt-1">
                       Available: {dynamicWindow.start || gap.start_time} - {dynamicWindow.end || gap.end_time}
                     </div>
                    {newTaskForm.duration && (() => {
                      const [hours, minutes] = newTaskForm.duration.split(':').map(Number);
                      const taskDurationMinutes = (hours * 60) + minutes;
                      const validation = validateStartTime(newTaskStartTime, taskDurationMinutes);
                      const latestStart = getLatestStartTime(taskDurationMinutes);
                      
                      if (!validation.isValid) {
                        return (
                          <div className="text-xs text-orange-400 mt-1">
                            ⚠️ {validation.message}
                          </div>
                        );
                      }
                      return (
                        <div className="text-xs text-green-400 mt-1">
                          ✓ Latest start: {latestStart}
                        </div>
                      );
                    })()}
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
                        const start = newTaskStartTime || gap.start_time;
                        const validation = validateStartTime(start, taskDurationMinutes);
                        
                        if (taskDurationMinutes > gapDurationMinutes) {
                          return (
                            <span className="text-red-400">
                              Task duration ({formatDuration(taskDurationMinutes)}) exceeds gap duration ({formatDuration(gapDurationMinutes)})
                            </span>
                          );
                        } else if (!validation.isValid) {
                          return (
                            <span className="text-orange-400">
                              ⚠️ {validation.message}
                            </span>
                          );
                        }
                        return (
                          <span className="text-green-400">
                            ✓ Task will use {formatDuration(taskDurationMinutes)} of {formatDuration(gapDurationMinutes)} available
                          </span>
                        );
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
                      const start = newTaskStartTime || gap.start_time;
                      const validation = validateStartTime(start, taskDurationMinutes);
                      return taskDurationMinutes > gapDurationMinutes || !validation.isValid;
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

  // Always render modal in a portal to avoid iOS fixed-position quirks inside scrollable containers
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}