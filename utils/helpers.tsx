import { Clock, User, Briefcase, Heart, BookOpen, Home } from 'lucide-react';
import { UserPreferences } from '../types/index';

export const renderSafeIcon = (iconIdentifier: string | React.ReactNode | undefined | null) => {
  // Map string identifiers to actual React elements
  const iconMap: { [key: string]: React.ReactNode } = {
    'Personal': <User className="w-4 h-4" />,
    'Work': <Briefcase className="w-4 h-4" />,
    'Health': <Heart className="w-4 h-4" />,
    'Learning': <BookOpen className="w-4 h-4" />,
    'Chores': <Home className="w-4 h-4" />,
    'default': <Clock className="w-4 h-4" />
  };

  try {
    // Handle null, undefined, or empty string
    if (!iconIdentifier || iconIdentifier === '') {
      return <Clock className="w-4 h-4" />;
    }
    
    // If it's a string, map it to an icon
    if (typeof iconIdentifier === 'string') {
      return iconMap[iconIdentifier] || <Clock className="w-4 h-4" />;
    }
    
    // If it's already a React element (legacy), try to render it safely
    if (iconIdentifier && typeof iconIdentifier === 'object' && 'type' in iconIdentifier) {
      return iconIdentifier;
    }
    
    return <Clock className="w-4 h-4" />;
  } catch (error) {
    console.warn('Error rendering icon:', error, iconIdentifier);
    return <Clock className="w-4 h-4" />;
  }
};

export const getActivityTime = (index: number): string => {
  switch (index) {
    case 0: return 'This morning';
    case 1: return 'Yesterday';
    default: return `${index + 1} days ago`;
  }
};

export const getActivityIconColor = (iconColor: string): string => {
  const colorMap: { [key: string]: string } = {
    'text-red-400': 'bg-red-500',
    'text-blue-400': 'bg-blue-500',
    'text-purple-400': 'bg-purple-500',
    'text-green-400': 'bg-green-500',
    'text-yellow-400': 'bg-yellow-500',
    'text-orange-400': 'bg-orange-500',
    'text-teal-400': 'bg-teal-500',
    'text-pink-400': 'bg-pink-500',
    'text-indigo-400': 'bg-indigo-500',
  };
  
  return colorMap[iconColor] || 'bg-green-500';
};

// Sanitize tasks to ensure icons are strings and required fields are present
export const sanitizeTask = (task: any): any => {
  if (!task) return task;
  
  return {
    ...task,
    icon: typeof task.icon === 'string' ? task.icon : (task.category || 'default'),
    priority: task.priority || 'Medium',
    energyLevel: task.energyLevel || 'Medium',
    status: task.status || 'draft',
    isCompleted: task.isCompleted || task.is_completed || task.completed || false,
    is_completed: task.is_completed || task.isCompleted || task.completed || false
  };
};

// Sanitize an array of tasks
export const sanitizeTasks = (tasks: any[]): any[] => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map(sanitizeTask);
};

// Timezone and time helper functions
export const getUserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

export const getLocalDate = (date: string | Date) => {
  if (typeof date === 'string') {
    return new Date(date);
  }
  return date;
};

export const getLocalTimeString = (date: string | Date, format = 'HH:mm') => {
  const localDate = getLocalDate(date);
  
  if (format === 'HH:mm') {
    return localDate.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  return localDate.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit'
  });
};

export const isTodayLocal = (date: string | Date) => {
  const local = getLocalDate(date);
  const now = new Date();
  return (
    local.getFullYear() === now.getFullYear() &&
    local.getMonth() === now.getMonth() &&
    local.getDate() === now.getDate()
  );
};

// Round down to the current hour
export const roundDownToHour = (date: Date = new Date()) => {
  const roundedDate = new Date(date);
  roundedDate.setMinutes(0, 0, 0);
  return roundedDate;
};

// Format time for timeline display (12-hour format)
export const formatTimelineTime = (hour: number, minute: number = 0) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return minute > 0 ? `${displayHour}:${minute.toString().padStart(2, '0')} ${period}` : `${displayHour} ${period}`;
};

// Convert time string (HH:MM) to minutes since start of day
export const timeToMinutes = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Convert minutes since start of day to time string (HH:MM)
export const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Calculate remaining time for ongoing gaps
export const calculateRemainingTime = (endTime: string, currentTime: Date = new Date()) => {
  const now = currentTime;
  const currentMinutes = timeToMinutes(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
  const endMinutes = safeTimeToMinutes(endTime);
  
  return Math.max(0, endMinutes - currentMinutes);
};

// Check if a gap is currently ongoing
export const isGapOngoing = (startTime: string, endTime: string, currentTime: Date = new Date()) => {
  const now = currentTime;
  const currentMinutes = timeToMinutes(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

// Combine date and time into a proper ISO timestamp for database storage
export const combineDateAndTime = (dateStr: string | null | undefined, timeStr: string | null | undefined): string | null => {
  if (!dateStr || !timeStr) {
    return null;
  }
  
  try {
    // Parse the date (expected in YYYY-MM-DD format)
    const date = new Date(dateStr + 'T00:00:00.000Z');
    
    // Parse the time (expected in HH:MM format)
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Set the time on the date
    date.setUTCHours(hours, minutes, 0, 0);
    
    // Return ISO string with timezone
    return date.toISOString();
  } catch (error) {
    console.warn('Error combining date and time:', { dateStr, timeStr, error });
    return null;
  }
};

// Split a timestamp back into separate date and time components for frontend display
export const splitTimestamp = (timestamp: string | null | undefined): { date: string | null; time: string | null } => {
  if (!timestamp) {
    return { date: null, time: null };
  }
  
  try {
    const date = new Date(timestamp);
    
    // Extract date in YYYY-MM-DD format
    const dateStr = date.toISOString().split('T')[0];
    
    // Extract time in HH:MM format
    const timeStr = date.toTimeString().slice(0, 5);
    
    return { date: dateStr, time: timeStr };
  } catch (error) {
    console.warn('Error splitting timestamp:', { timestamp, error });
    return { date: null, time: null };
  }
};

// Extract time in HH:MM format from ISO datetime string or return as-is if already in HH:MM format
export const extractTimeFromDateTime = (dateTimeStr: string | null | undefined): string | null => {
  if (!dateTimeStr) {
    return null;
  }
  
  try {
    // If it's already in HH:MM format (contains : but not T), return as-is
    if (dateTimeStr.includes(':') && !dateTimeStr.includes('T')) {
      return dateTimeStr;
    }
    
    // If it's an ISO datetime string, extract the time part
    if (dateTimeStr.includes('T')) {
      const date = new Date(dateTimeStr);
      return date.toTimeString().slice(0, 5); // HH:MM format
    }
    
    // Fallback: try to parse as time string
    return dateTimeStr;
  } catch (error) {
    console.warn('Error extracting time from datetime:', { dateTimeStr, error });
    return null;
  }
};

// Safe time conversion that handles both HH:MM and ISO datetime formats
export const safeTimeToMinutes = (timeStr: string | null | undefined): number => {
  if (!timeStr) {
    return 0;
  }
  
  try {
    const extractedTime = extractTimeFromDateTime(timeStr);
    if (!extractedTime) {
      return 0;
    }
    
    const [hours, minutes] = extractedTime.split(':').map(Number);
    return hours * 60 + minutes;
  } catch (error) {
    console.warn('Error converting time to minutes:', { timeStr, error });
    return 0;
  }
};

// Calculate duration between two time strings (handles both formats)
export const calculateGapDuration = (startTime: string | null | undefined, endTime: string | null | undefined): number => {
  if (!startTime || !endTime) {
    return 0;
  }
  
  try {
    const startMinutes = safeTimeToMinutes(startTime);
    const endMinutes = safeTimeToMinutes(endTime);
    
    return Math.max(0, endMinutes - startMinutes);
  } catch (error) {
    console.warn('Error calculating gap duration:', { startTime, endTime, error });
    return 0;
  }
};

// Format time duration in seconds to readable format (used by timer components)
export const formatTime = (seconds: number): string => {
  if (seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};