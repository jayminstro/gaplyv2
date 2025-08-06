import { UserPreferences } from '../../types/index';

export interface ValidationLevel {
  strict: boolean;
  checkCriticalFields: boolean;
  checkTimeFormats: boolean;
  checkLogic: boolean;
  checkConstraints: boolean;
}

export interface ValidationRequest {
  preferences: UserPreferences;
  validationLevel: 'strict' | 'relaxed' | 'critical';
  userId?: string;
}

export interface ValidationResponse {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  criticalFields: string[];
  suggestions: string[];
  validationLevel: string;
  timestamp: string;
}

export interface ValidationRule {
  field: keyof UserPreferences;
  required: boolean;
  validator: (value: any) => { isValid: boolean; error?: string; warning?: string };
  critical: boolean;
}

export class PreferenceValidationAPI {
  private static baseURL = '/api/preferences';

  /**
   * Validate preferences on the server
   */
  static async validate(request: ValidationRequest): Promise<ValidationResponse> {
    try {
      const response = await fetch(`${this.baseURL}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Server validation failed, falling back to client validation:', error);
      return this.clientSideValidation(request.preferences, request.validationLevel);
    }
  }

  /**
   * Validate critical fields only
   */
  static async validateCritical(preferences: UserPreferences): Promise<ValidationResponse> {
    return this.validate({
      preferences,
      validationLevel: 'critical'
    });
  }

  /**
   * Validate with strict rules
   */
  static async validateStrict(preferences: UserPreferences): Promise<ValidationResponse> {
    return this.validate({
      preferences,
      validationLevel: 'strict'
    });
  }

  /**
   * Client-side validation fallback
   */
  private static clientSideValidation(
    preferences: UserPreferences, 
    level: string
  ): ValidationResponse {
    const errors: string[] = [];
    const warnings: string[] = [];
    const criticalFields: string[] = [];
    const suggestions: string[] = [];

    const validationRules = this.getValidationRules(level);

    for (const rule of validationRules) {
      const value = preferences[rule.field];
      const result = rule.validator(value);

      if (!result.isValid) {
        if (rule.critical) {
          errors.push(result.error || `Invalid ${rule.field}`);
          criticalFields.push(rule.field);
        } else {
          warnings.push(result.error || `Invalid ${rule.field}`);
        }
      } else if (result.warning) {
        warnings.push(result.warning);
      }
    }

    // Additional logic validation
    if (level === 'strict' || level === 'relaxed') {
      const logicValidation = this.validateLogic(preferences);
      errors.push(...logicValidation.errors);
      warnings.push(...logicValidation.warnings);
      suggestions.push(...logicValidation.suggestions);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      criticalFields,
      suggestions,
      validationLevel: level,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get validation rules based on level
   */
  private static getValidationRules(level: string): ValidationRule[] {
    const baseRules: ValidationRule[] = [
      {
        field: 'calendar_work_start',
        required: true,
        critical: true,
        validator: (value) => {
          if (!value) return { isValid: false, error: 'Work start time is required' };
          if (!this.isValidTimeFormat(value)) {
            return { isValid: false, error: 'Invalid time format (use HH:MM or HH:MM:SS)' };
          }
          return { isValid: true };
        }
      },
      {
        field: 'calendar_work_end',
        required: true,
        critical: true,
        validator: (value) => {
          if (!value) return { isValid: false, error: 'Work end time is required' };
          if (!this.isValidTimeFormat(value)) {
            return { isValid: false, error: 'Invalid time format (use HH:MM or HH:MM:SS)' };
          }
          return { isValid: true };
        }
      },
      {
        field: 'calendar_working_days',
        required: true,
        critical: true,
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return { isValid: false, error: 'Working days must be a non-empty array' };
          }
          return { isValid: true };
        }
      },
      {
        field: 'calendar_include_weekends',
        required: false,
        critical: false,
        validator: (value) => {
          if (typeof value !== 'boolean') {
            return { isValid: false, error: 'Include weekends must be a boolean' };
          }
          return { isValid: true };
        }
      },
      {
        field: 'calendar_min_gap',
        required: false,
        critical: false,
        validator: (value) => {
          if (value !== undefined && (typeof value !== 'number' || value < 5)) {
            return { isValid: false, error: 'Minimum gap must be at least 5 minutes' };
          }
          return { isValid: true };
        }
      }
    ];

    if (level === 'strict') {
      baseRules.push(
        {
          field: 'quiet_hours_start',
          required: false,
          critical: false,
          validator: (value) => {
            if (value && !this.isValidTimeFormat(value)) {
              return { isValid: false, error: 'Invalid quiet hours start time format' };
            }
            return { isValid: true };
          }
        },
        {
          field: 'quiet_hours_end',
          required: false,
          critical: false,
          validator: (value) => {
            if (value && !this.isValidTimeFormat(value)) {
              return { isValid: false, error: 'Invalid quiet hours end time format' };
            }
            return { isValid: true };
          }
        },
        {
          field: 'preferred_categories',
          required: false,
          critical: false,
          validator: (value) => {
            if (value && (!Array.isArray(value) || value.length === 0)) {
              return { isValid: false, error: 'Preferred categories must be a non-empty array' };
            }
            return { isValid: true };
          }
        }
      );
    }

    return baseRules;
  }

  /**
   * Validate logical relationships between preferences
   */
  private static validateLogic(preferences: UserPreferences): {
    errors: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Work hours logic
    if (preferences.calendar_work_start && preferences.calendar_work_end) {
      const startMinutes = this.timeToMinutes(preferences.calendar_work_start);
      const endMinutes = this.timeToMinutes(preferences.calendar_work_end);

      if (startMinutes >= endMinutes) {
        errors.push('Work start time must be before work end time');
      }

      if (endMinutes - startMinutes < 60) {
        warnings.push('Work hours are less than 1 hour');
        suggestions.push('Consider extending your work hours for better productivity');
      }

      if (endMinutes - startMinutes > 12 * 60) {
        warnings.push('Work hours are more than 12 hours');
        suggestions.push('Consider shorter work hours for better work-life balance');
      }
    }

    // Quiet hours logic
    if (preferences.quiet_hours_start && preferences.quiet_hours_end) {
      const quietStart = this.timeToMinutes(preferences.quiet_hours_start);
      const quietEnd = this.timeToMinutes(preferences.quiet_hours_end);

      if (quietStart >= quietEnd) {
        warnings.push('Quiet hours start time should be before end time');
      }

      // Check if quiet hours overlap with work hours
      if (preferences.calendar_work_start && preferences.calendar_work_end) {
        const workStart = this.timeToMinutes(preferences.calendar_work_start);
        const workEnd = this.timeToMinutes(preferences.calendar_work_end);

        if (this.doTimeRangesOverlap(workStart, workEnd, quietStart, quietEnd)) {
          warnings.push('Quiet hours overlap with work hours');
          suggestions.push('Consider adjusting quiet hours to avoid work time conflicts');
        }
      }
    }

    // Working days logic
    if (preferences.calendar_working_days) {
      if (preferences.calendar_working_days.length === 0) {
        errors.push('At least one working day must be selected');
      }

      if (preferences.calendar_working_days.length === 7 && !preferences.calendar_include_weekends) {
        warnings.push('All days selected but weekends not included');
        suggestions.push('Consider enabling weekend inclusion or reducing working days');
      }
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Validate time format (HH:MM or HH:MM:SS)
   */
  private static isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    return timeRegex.test(time);
  }

  /**
   * Convert time string to minutes
   */
  private static timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Check if two time ranges overlap
   */
  private static doTimeRangesOverlap(
    start1: number, 
    end1: number, 
    start2: number, 
    end2: number
  ): boolean {
    return start1 < end2 && end1 > start2;
  }
} 