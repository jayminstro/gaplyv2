import { UserPreferences, UnsavedChanges, TimeGap } from '../types/index';

export const DEFAULT_PREFERENCES: UserPreferences = {
  // Work Schedule & Calendar
  calendar_work_start: '09:00',
  calendar_work_end: '18:00',
  calendar_working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  calendar_include_weekends: false,
  calendar_buffer_time: 5,
  calendar_min_gap: 15,
  gap_sync_frequency: 30,
  
  // Timer & Activity Settings
  autostart: true,
  show_timer: true,
  default_energy_level: 'Medium',
  preferred_categories: ['Personal', 'Work', 'Health'],
  preferred_activity_durations: [5, 10, 15, 25, 30],
  activity_success_threshold: 80,
  
  // Notifications & Reminders
  daily_reminder: true,
  notification_activity_reminders: true,
  notification_upcoming_gaps: true,
  notification_lead_time: 5,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  
  // Appearance & Interface
  dark_mode: true,
  sound_enabled: true,
  vibration_enabled: true,
  
  // Advanced Features
  learning_enabled: true,
  habit_tracking_enabled: true,
  manual_mode: false,
  demo_mode: false,
  onboarding_completed: true
};

export const DEFAULT_UNSAVED_CHANGES: UnsavedChanges = {
  profile: false,
  calendar: false,
  activities: false,
  notifications: false,
  interface: false,
  advanced: false
};

export const DEFAULT_GAPS: TimeGap[] = [
  {
    id: 'gap-1',
    user_id: 'default-user',
    start_time: '18:30',
    end_time: '19:00',
    duration: 30,
    duration_minutes: 30,
    is_available: true,
    next_event_title: 'Dinner',
    quality_score: 0.8,
    gap_source_id: 'default',
    modified_by: 'system',
    last_modified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0]
  },
  {
    id: 'gap-2',
    user_id: 'default-user', 
    start_time: '19:30',
    end_time: '20:00',
    duration: 30,
    duration_minutes: 30,
    is_available: true,
    quality_score: 0.7,
    gap_source_id: 'default',
    modified_by: 'system',
    last_modified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0]
  }
];