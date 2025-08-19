import { UserPreferences } from '../../types/index';

export interface PreferenceChangeEvent {
  field: keyof UserPreferences;
  oldValue: any;
  newValue: any;
  impact: 'low' | 'medium' | 'high';
  requiresGapRecalculation: boolean;
  requiresImmediateUpdate: boolean;
  affectedDates: string[];
  description: string;
}

export interface ChangeDetectionResult {
  hasChanges: boolean;
  changes: PreferenceChangeEvent[];
  requiresGapRecalculation: boolean;
  requiresImmediateUpdate: boolean;
  summary: string;
  affectedDateRange: {
    start: string;
    end: string;
  } | null;
}

export interface ImpactConfig {
  critical: {
    fields: (keyof UserPreferences)[];
    impact: 'high';
    requiresGapRecalculation: boolean;
    requiresImmediateUpdate: boolean;
  };
  medium: {
    fields: (keyof UserPreferences)[];
    impact: 'medium';
    requiresGapRecalculation: boolean;
    requiresImmediateUpdate: boolean;
  };
  low: {
    fields: (keyof UserPreferences)[];
    impact: 'low';
    requiresGapRecalculation: boolean;
    requiresImmediateUpdate: boolean;
  };
}

export class PreferenceChangeDetector {
  private static instance: PreferenceChangeDetector;
  private impactConfig: ImpactConfig;

  private constructor() {
    this.impactConfig = {
      critical: {
        fields: [
          'calendar_work_start',
          'calendar_work_end',
          'calendar_working_days',
        ],
        impact: 'high',
        requiresGapRecalculation: true,
        requiresImmediateUpdate: true
      },
      medium: {
        fields: [
          'calendar_min_gap',
          'calendar_buffer_time',
          'show_device_calendar_busy',
          'device_calendar_included_ids',
          'calendar_block_tentative',
          'calendar_dedupe_strategy',
          'planning_slot_minutes'
        ],
        impact: 'medium',
        requiresGapRecalculation: true,
        requiresImmediateUpdate: false
      },
      low: {
        fields: [
          'dark_mode',
          'sound_enabled',
          'vibration_enabled',
          'default_energy_level',
          'preferred_categories',
          'autostart',
          'show_timer',
          'show_device_calendar_titles',
          'calendar_all_day_block_mode',
          'calendar_all_day_fixed_block_minutes',
          'calendar_all_day_fixed_block_start',
          'calendar_block_needs_action',
          'debugCalendarSync'
        ],
        impact: 'low',
        requiresGapRecalculation: false,
        requiresImmediateUpdate: false
      }
    };
  }

  static getInstance(): PreferenceChangeDetector {
    if (!PreferenceChangeDetector.instance) {
      PreferenceChangeDetector.instance = new PreferenceChangeDetector();
    }
    return PreferenceChangeDetector.instance;
  }

  /**
   * Detect changes between old and new preferences
   */
  detectChanges(
    oldPreferences: UserPreferences,
    newPreferences: UserPreferences
  ): ChangeDetectionResult {
    const changes: PreferenceChangeEvent[] = [];
    let requiresGapRecalculation = false;
    let requiresImmediateUpdate = false;

    // Check each field for changes
    for (const field of Object.keys(newPreferences) as (keyof UserPreferences)[]) {
      const oldValue = oldPreferences[field];
      const newValue = newPreferences[field];

      if (!this.isEqual(oldValue, newValue)) {
        const changeEvent = this.createChangeEvent(field, oldValue, newValue);
        changes.push(changeEvent);

        if (changeEvent.requiresGapRecalculation) {
          requiresGapRecalculation = true;
        }

        if (changeEvent.requiresImmediateUpdate) {
          requiresImmediateUpdate = true;
        }
      }
    }

    const affectedDateRange = this.calculateAffectedDateRange(changes);
    const summary = this.generateSummary(changes);

    return {
      hasChanges: changes.length > 0,
      changes,
      requiresGapRecalculation,
      requiresImmediateUpdate,
      summary,
      affectedDateRange
    };
  }

  /**
   * Create a change event for a specific field
   */
  private createChangeEvent(
    field: keyof UserPreferences,
    oldValue: any,
    newValue: any
  ): PreferenceChangeEvent {
    const impact = this.getFieldImpact(field);
    const config = this.impactConfig[impact];

    return {
      field,
      oldValue,
      newValue,
      impact: config.impact,
      requiresGapRecalculation: config.requiresGapRecalculation,
      requiresImmediateUpdate: config.requiresImmediateUpdate,
      affectedDates: this.getAffectedDates(field, oldValue, newValue),
      description: this.generateChangeDescription(field, oldValue, newValue)
    };
  }

  /**
   * Get impact level for a field
   */
  private getFieldImpact(field: keyof UserPreferences): 'critical' | 'medium' | 'low' {
    if (this.impactConfig.critical.fields.includes(field)) {
      return 'critical';
    }
    if (this.impactConfig.medium.fields.includes(field)) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate affected date range for changes
   */
  private calculateAffectedDateRange(changes: PreferenceChangeEvent[]): {
    start: string;
    end: string;
  } | null {
    const criticalChanges = changes.filter(change => 
      change.requiresGapRecalculation && change.impact === 'high'
    );

    if (criticalChanges.length === 0) {
      return null;
    }

    // For critical changes, affect the next 14 days
    const today = new Date();
    const start = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const endDateObj = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const end = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth()+1).padStart(2,'0')}-${String(endDateObj.getDate()).padStart(2,'0')}`;

    return { start, end };
  }

  /**
   * Get affected dates for a specific change
   */
  private getAffectedDates(
    field: keyof UserPreferences,
    _oldValue: any,
    _newValue: any
  ): string[] {
    const dates: string[] = [];
    const today = new Date();

    // For working days changes, affect all future dates
    if (field === 'calendar_working_days') {
      for (let i = 0; i < 14; i++) {
        const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        dates.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);
      }
    }
    // For work hours changes, affect all future dates
    else if (field === 'calendar_work_start' || field === 'calendar_work_end') {
      for (let i = 0; i < 14; i++) {
        const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        dates.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);
      }
    }
    // For other changes, affect today and tomorrow
    else {
      dates.push(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      dates.push(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`);
    }

    return dates;
  }

  /**
   * Generate human-readable change description
   */
  private generateChangeDescription(
    field: keyof UserPreferences,
    oldValue: any,
    newValue: any
  ): string {
    switch (field) {
      case 'calendar_work_start':
        return `Work start time changed from ${oldValue} to ${newValue}`;
      case 'calendar_work_end':
        return `Work end time changed from ${oldValue} to ${newValue}`;
      case 'calendar_working_days': {
        const oldList = Array.isArray(oldValue) ? oldValue : Object.values(oldValue || {});
        const newList = Array.isArray(newValue) ? newValue : Object.values(newValue || {});
        return `Working days changed from ${oldList.join(', ')} to ${newList.join(', ')}`;
      }
      case 'calendar_min_gap':
        return `Minimum gap changed from ${oldValue} to ${newValue} minutes`;
      case 'dark_mode':
        return `Dark mode changed from ${oldValue} to ${newValue}`;
      default:
        return `${field} changed from ${oldValue} to ${newValue}`;
    }
  }

  /**
   * Generate summary of all changes
   */
  private generateSummary(changes: PreferenceChangeEvent[]): string {
    if (changes.length === 0) {
      return 'No changes detected';
    }

    const criticalChanges = changes.filter(c => c.impact === 'high');
    const mediumChanges = changes.filter(c => c.impact === 'medium');
    const lowChanges = changes.filter(c => c.impact === 'low');

    const parts: string[] = [];

    if (criticalChanges.length > 0) {
      parts.push(`${criticalChanges.length} critical change${criticalChanges.length > 1 ? 's' : ''}`);
    }
    if (mediumChanges.length > 0) {
      parts.push(`${mediumChanges.length} medium change${mediumChanges.length > 1 ? 's' : ''}`);
    }
    if (lowChanges.length > 0) {
      parts.push(`${lowChanges.length} minor change${lowChanges.length > 1 ? 's' : ''}`);
    }

    return parts.join(', ');
  }

  /**
   * Deep equality check for values
   */
  private isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.isEqual(a[key], b[key])) return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Update impact configuration
   */
  updateImpactConfig(newConfig: Partial<ImpactConfig>): void {
    this.impactConfig = { ...this.impactConfig, ...newConfig };
  }

  /**
   * Get current impact configuration
   */
  getImpactConfig(): ImpactConfig {
    return { ...this.impactConfig };
  }

  /**
   * Check if a field requires gap recalculation
   */
  requiresGapRecalculation(field: keyof UserPreferences): boolean {
    const impact = this.getFieldImpact(field);
    return this.impactConfig[impact].requiresGapRecalculation;
  }

  /**
   * Check if a field requires immediate update
   */
  requiresImmediateUpdate(field: keyof UserPreferences): boolean {
    const impact = this.getFieldImpact(field);
    return this.impactConfig[impact].requiresImmediateUpdate;
  }
} 