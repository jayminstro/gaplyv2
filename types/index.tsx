export interface Task {
  id: string;
  user_id?: string;
  title: string;
  category: string;
  duration: string; // Frontend uses HH:MM:SS format
  dueDate?: string;
  dueTime?: string;
  status: 'scheduled' | 'overdue' | 'draft' | 'completed';
  isTimerRunning?: boolean;
  timerRemaining?: number;
  timerTotal?: number;
  iconColor: string;
  icon: string; // Store as string identifier instead of React.ReactNode
  notes?: string;
  energyLevel?: string;
  priority?: string; // Added priority field from database schema
  reminderDate?: string;
  reminderTime?: string;
  scheduledGapId?: string; // Client-only/ephemeral identifier for UI interactions; not sent to server
  googleCalendarEventId?: string; // Google Calendar event ID if created
  completedSessions?: number;
  isCompleted?: boolean;
  is_completed?: boolean; // Database field
  timerStoppedAt?: string; // Added from database schema
  created_at?: string;
  updated_at?: string;
}

export interface TimeGap {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  parent_gap_id?: string;
  original_gap_id?: string;
  created_at: string;
  updated_at: string;
  modified_by: 'system' | 'user' | 'calendar_sync';
}

export interface UserPreferences {
  // Database fields
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  
  // Work Schedule & Calendar
  calendar_work_start: string;
  calendar_work_end: string;
  calendar_working_days: string[];
  calendar_buffer_time: number;
  calendar_min_gap: number;
  gap_sync_frequency: number;
  
  // Google Calendar Integration
  google_calendar_connected?: boolean;
  google_calendar_access_token?: string;
  google_calendar_refresh_token?: string;
  google_calendar_token_expires?: string;
  google_calendar_email?: string;
  google_calendar_last_sync?: string;
  // Server whitelist variants (ensure type parity)
  google_access_token?: string;
  google_refresh_token?: string;
  google_token_expires_at?: string;
  
  // Device Calendar Integration (iOS)
  show_device_calendar_busy?: boolean;           // default false
  show_device_calendar_titles?: boolean;         // default false
  device_calendar_included_ids?: string[];       // default []
  
  // Timer & Activity Settings
  autostart: boolean;
  show_timer: boolean;
  default_energy_level: string;
  preferred_categories: string[];
  preferred_activity_durations: number[];
  activity_success_threshold: number;
  
  // Notifications & Reminders
  daily_reminder: boolean;
  notification_activity_reminders: boolean;
  notification_upcoming_gaps: boolean;
  notification_lead_time: number;
  // Quiet hours (server whitelist)
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  
  // Appearance & Interface
  dark_mode: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
  time_format?: '12h' | '24h';
  show_duration_in_planner?: boolean;
  timezone?: string;
  
  // Advanced Features
  learning_enabled: boolean;
  habit_tracking_enabled: boolean;
  manual_mode: boolean;
  demo_mode: boolean;
  onboarding_completed: boolean;
  // Additional server-managed fields
  calendar_include_weekends?: boolean;
  calendar_event_status?: string;
  last_gap_sync?: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_country_code: string;
  phone_number: string;
  timezone: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Deprecated: server-only legacy type. Not used by client; gaps are derived locally.
export interface ScheduledGap {
  id: string;
  user_id: string;
  gap_id: string;
  task_id?: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  timer_start_time?: string;
  timer_end_time?: string;
  timer_duration?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityCompletion {
  id: string;
  user_id: string;
  activity_id?: string;
  activity_title: string;
  activity_category: string;
  duration_planned: number;
  duration_actual: number;
  satisfaction_rating?: number;
  mood_before?: string;
  mood_after?: string;
  notes?: string;
  completed_at: string;
}

export interface CalendarSource {
  listEvents(startISO: string, endISO: string, opts?: { includeCalendarIds?: string[] }): Promise<BusyBlock[]>;
}

export interface BusyBlock {
  id: string;
  calendarId: string;
  calendarLabel?: string;
  date: string;         // YYYY-MM-DD (local)
  start_time: string;   // HH:MM (local)
  end_time: string;     // HH:MM (local)
  isAllDay?: boolean;
  source: 'device_calendar';
  external_id?: string; // icalUID or id
}

export interface UnsavedChanges {
  profile: boolean;
  calendar: boolean;
  activities: boolean;
  notifications: boolean;
  interface: boolean;
  advanced: boolean;
}