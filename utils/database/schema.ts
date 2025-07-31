import { Task, TimeGap, UserPreferences, UserProfile, ScheduledGap, ActivityCompletion } from '../../types/index';

// Enhanced local models with sync flags
export interface LocalTask extends Task {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

export interface LocalTimeGap extends TimeGap {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

export interface LocalUserPreferences extends UserPreferences {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

export interface LocalUserProfile extends UserProfile {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

export interface LocalScheduledGap extends ScheduledGap {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

export interface LocalActivityCompletion extends ActivityCompletion {
  is_synced: boolean;
  sync_version: number;
  deleted_at?: string;
  local_updated_at: string;
}

// Sync queue for tracking pending operations
export interface SyncQueueItem {
  id: string;
  table: 'tasks' | 'gaps' | 'preferences' | 'profile' | 'scheduled_gaps' | 'activity_completions';
  operation: 'create' | 'update' | 'delete';
  data: any;
  created_at: string;
  retry_count: number;
  last_retry_at?: string;
  error_message?: string;
}

// Database schema version tracking
export interface DatabaseSchema {
  version: number;
  last_migration: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Database configuration
export const DATABASE_CONFIG = {
  name: 'GaplyLocalDB',
  version: 1,
  tables: {
    tasks: 'tasks',
    gaps: 'gaps',
    preferences: 'preferences',
    profile: 'profile',
    scheduled_gaps: 'scheduled_gaps',
    activity_completions: 'activity_completions',
    sync_queue: 'sync_queue',
    schema: 'schema'
  }
} as const;

// Index definitions for efficient queries
export const DATABASE_INDEXES = {
  tasks: ['user_id', 'dueDate', 'status', 'is_synced', 'deleted_at'],
  gaps: ['user_id', 'date', 'gap_source_id', 'is_synced', 'deleted_at'],
  preferences: ['user_id', 'is_synced'],
  profile: ['user_id', 'is_synced'],
  scheduled_gaps: ['user_id', 'gap_id', 'task_id', 'is_synced', 'deleted_at'],
  activity_completions: ['user_id', 'completed_at', 'is_synced', 'deleted_at'],
  sync_queue: ['table', 'operation', 'created_at', 'retry_count']
} as const; 