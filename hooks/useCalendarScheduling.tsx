import { useState } from 'react';
import { Task, TimeGap } from '../types/index';
import { toast } from 'sonner@2.0.3';

interface ScheduleTaskOptions {
  task: Task;
  gap: TimeGap;
  customTime?: string;
  createCalendarEvent?: boolean;
}

interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export function useCalendarScheduling() {
  const [isScheduling, setIsScheduling] = useState(false);

  const scheduleTaskToGap = async (options: ScheduleTaskOptions) => {
    setIsScheduling(true);
    
    try {
      const { task, gap, customTime, createCalendarEvent = false } = options;
      
      // Calculate task times
      const taskDuration = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
      const startTime = customTime || gap.start_time;
      
      // Parse start time and calculate end time
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = startMinutes + taskDuration;
      const endHour = Math.floor(endMinutes / 60);
      const endMinute = endMinutes % 60;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      // Check if task fits in the gap
      const gapStartMinutes = parseInt(gap.start_time.split(':')[0]) * 60 + parseInt(gap.start_time.split(':')[1]);
      const gapEndMinutes = parseInt(gap.end_time.split(':')[0]) * 60 + parseInt(gap.end_time.split(':')[1]);
      
      if (startMinutes < gapStartMinutes || endMinutes > gapEndMinutes) {
        throw new Error('Task does not fit in the selected time slot');
      }
      
      // Update task with schedule information
      const updatedTask: Task = {
        ...task,
        dueDate: gap.date || 'Today',
        dueTime: startTime,
        status: 'scheduled' as const,
        scheduledGapId: gap.id
      };
      
      // Create calendar event if requested and user has Google Calendar connected
      if (createCalendarEvent) {
        await createGoogleCalendarEvent(updatedTask, gap);
      }
      
      return {
        success: true,
        scheduledTask: updatedTask,
        startTime,
        endTime
      };
      
    } catch (error) {
      console.error('Error scheduling task:', error);
      toast.error('Failed to schedule task', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setIsScheduling(false);
    }
  };

  const createGoogleCalendarEvent = async (task: Task, gap: TimeGap) => {
    try {
      const { supabase } = await import('../utils/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Get user preferences to check if calendar is connected
      const { projectId } = await import('../utils/supabase/info');
      const preferencesResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/preferences`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!preferencesResponse.ok) {
        throw new Error('Failed to get user preferences');
      }
      
      const preferences = await preferencesResponse.json();
      
      if (!preferences.google_calendar_connected) {
        throw new Error('Google Calendar not connected');
      }

      // Calculate event times
      const taskDuration = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
      const eventDate = gap.date || new Date().toISOString().split('T')[0];
      const startDateTime = `${eventDate}T${task.dueTime}:00`;
      
      const startTime = new Date(startDateTime);
      const endTime = new Date(startTime.getTime() + (taskDuration * 60 * 1000));
      
      const calendarEvent: CalendarEvent = {
        summary: task.title,
        description: task.notes ? `${task.notes}\n\nScheduled via Gaply` : 'Scheduled via Gaply',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: preferences.timezone || 'America/New_York'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: preferences.timezone || 'America/New_York'
        }
      };

      // Create the event using Google Calendar API
      const createEventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${preferences.google_calendar_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      });

      if (!createEventResponse.ok) {
        const error = await createEventResponse.json();
        throw new Error(`Failed to create calendar event: ${error.error?.message || createEventResponse.statusText}`);
      }

      const createdEvent = await createEventResponse.json();
      
      toast.success('Event created in Google Calendar', {
        description: `"${task.title}" scheduled for ${task.dueTime}`
      });
      
      return createdEvent;
      
    } catch (error) {
      console.error('Error creating calendar event:', error);
      // Don't throw here - calendar event creation is optional
      toast.error('Task scheduled but calendar event failed', {
        description: error instanceof Error ? error.message : 'Could not create calendar event'
      });
    }
  };

  const findBestGapForTask = (task: Task, gaps: TimeGap[]): TimeGap | null => {
    const taskDuration = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
    
    // Filter gaps that can fit the task
    // In new architecture, all gaps in the table are available by definition
    const validGaps = gaps.filter(gap => 
      gap.duration_minutes >= taskDuration
    );
    
    if (validGaps.length === 0) return null;
    
    // Sort by duration (longest first), then by start time (earliest first)
    validGaps.sort((a, b) => {
      const durationDiff = b.duration_minutes - a.duration_minutes;
      if (durationDiff !== 0) return durationDiff;
      
      return a.start_time.localeCompare(b.start_time);
    });
    
    return validGaps[0];
  };

  const getAvailableTimeSlotsInGap = (gap: TimeGap, taskDuration: number, slotInterval = 15): string[] => {
    const slots: string[] = [];
    
    const gapStartMinutes = parseInt(gap.start_time.split(':')[0]) * 60 + parseInt(gap.start_time.split(':')[1]);
    const gapEndMinutes = parseInt(gap.end_time.split(':')[0]) * 60 + parseInt(gap.end_time.split(':')[1]);
    
    for (let minutes = gapStartMinutes; minutes + taskDuration <= gapEndMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeString);
    }
    
    return slots;
  };

  return {
    isScheduling,
    scheduleTaskToGap,
    findBestGapForTask,
    getAvailableTimeSlotsInGap,
    createGoogleCalendarEvent
  };
}