import { LocalTask, LocalTimeGap } from '../database/schema';

export interface Delta {
  id: string;
  changes: Record<string, any>;
  operation: 'create' | 'update' | 'delete';
  timestamp: string;
}

export class DeltaCalculator {
  
  // Calculate task delta for sync
  calculateTaskDelta(task: LocalTask): Delta {
    const changes: Record<string, any> = {};
    
    // Only include fields that have actually changed
    const fieldsToSync = [
      'title', 'category', 'duration', 'dueDate', 'dueTime', 'status',
      'iconColor', 'icon', 'notes', 'energyLevel', 'priority',
      'reminderDate', 'reminderTime', 'scheduledGapId', 'googleCalendarEventId',
      'completedSessions', 'isCompleted', 'timerStoppedAt'
    ];

    fieldsToSync.forEach(field => {
      if (task[field as keyof LocalTask] !== undefined) {
        changes[field] = task[field as keyof LocalTask];
      }
    });

    return {
      id: task.id,
      changes,
      operation: task.deleted_at ? 'delete' : (task.created_at === task.updated_at ? 'create' : 'update'),
      timestamp: task.local_updated_at
    };
  }

  // Calculate gap delta for sync
  calculateGapDelta(gap: LocalTimeGap): Delta {
    const changes: Record<string, any> = {};
    
    // Only include fields that have actually changed
    const fieldsToSync = [
      'date', 'start_time', 'end_time', 'duration', 'duration_minutes',
      'is_available', 'next_event_title', 'source', 'quality_score',
      'gap_source_id', 'modified_by', 'origin_gap_id'
    ];

    fieldsToSync.forEach(field => {
      if (gap[field as keyof LocalTimeGap] !== undefined) {
        changes[field] = gap[field as keyof LocalTimeGap];
      }
    });

    return {
      id: gap.id,
      changes,
      operation: gap.deleted_at ? 'delete' : (gap.created_at === gap.last_modified_at ? 'create' : 'update'),
      timestamp: gap.local_updated_at
    };
  }

  // Calculate bulk delta for multiple items
  calculateBulkDelta(items: (LocalTask | LocalTimeGap)[], type: 'task' | 'gap'): Delta[] {
    return items.map(item => {
      if (type === 'task') {
        return this.calculateTaskDelta(item as LocalTask);
      } else {
        return this.calculateGapDelta(item as LocalTimeGap);
      }
    });
  }

  // Detect changes between two versions
  detectChanges(oldVersion: any, newVersion: any): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};
    
    const allKeys = new Set([...Object.keys(oldVersion), ...Object.keys(newVersion)]);
    
    allKeys.forEach(key => {
      if (oldVersion[key] !== newVersion[key]) {
        changes[key] = {
          old: oldVersion[key],
          new: newVersion[key]
        };
      }
    });
    
    return changes;
  }

  // Optimize delta for network transmission
  optimizeDelta(delta: Delta): Delta {
    // Remove null/undefined values
    const optimizedChanges: Record<string, any> = {};
    
    Object.entries(delta.changes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        optimizedChanges[key] = value;
      }
    });

    return {
      ...delta,
      changes: optimizedChanges
    };
  }
} 