# Task: Remove Quiet Hours Feature and Use Work Hours for All Time-Based Logic

## Overview
Remove the redundant `quiet_hours_start` and `quiet_hours_end` preferences and update the application to use work hours (`calendar_work_start` and `calendar_work_end`) as the single source of truth for all time-based functionality including notifications, gap creation, and scheduling.

## Problem Statement
Currently, the app has two separate time range preferences:
1. **Work Hours**: 9:00 AM - 6:00 PM (for gap creation and scheduling)
2. **Quiet Hours**: 10:00 PM - 7:00 AM (for notifications, but not implemented)

This creates redundancy, confusion, and unnecessary complexity. Work hours should serve as the single source of truth for all time-based logic.

## Current Redundancy
- **Work Hours**: Define when user is available for activities
- **Quiet Hours**: Define when user should not be disturbed (inverse of work hours)
- **Overlap Validation**: System warns about conflicts between work and quiet hours
- **Unused Feature**: Quiet hours are stored but never actually used in app logic

## Implementation Plan

### Phase 1: Remove Quiet Hours from Types and Defaults
- [ ] **File**: `types/index.tsx`
  - Remove `quiet_hours_start: string;` from UserPreferences interface
  - Remove `quiet_hours_end: string;` from UserPreferences interface

- [ ] **File**: `utils/constants.tsx`
  - Remove `quiet_hours_start: '22:00',` from DEFAULT_PREFERENCES
  - Remove `quiet_hours_end: '07:00',` from DEFAULT_PREFERENCES

### Phase 2: Remove from UI
- [ ] **File**: `components/SettingsContent.tsx`
  - Remove the "Quiet Hours" section from notifications settings (lines 554-566)
  - Remove `quiet_hours_start` and `quiet_hours_end` from localPreferences state
  - Remove from change detection logic

### Phase 3: Remove from Validation
- [ ] **File**: `utils/api/preferenceValidation.ts`
  - Remove quiet hours validation rules (lines 196-212)
  - Remove quiet hours logic validation (lines 267-282)
  - Remove overlap checking between work hours and quiet hours

### Phase 4: Update Storage and Preferences
- [ ] **File**: `hooks/usePreferences.tsx`
  - Remove `quiet_hours_start` and `quiet_hours_end` from preference keys
  - Remove from default preference initialization
  - Remove from preference validation

- [ ] **File**: `utils/storage/PreferenceManager.ts`
  - Remove quiet hours from timeFields array (line 432)
  - Remove from default preferences
  - Remove from preference validation logic

- [ ] **File**: `utils/storage/PreferenceChangeDetector.ts`
  - Remove quiet hours from change detection (lines 67-68)
  - Remove from preference change handling

- [ ] **File**: `utils/storage/EnhancedStorageManager.ts`
  - Remove quiet hours from storage operations

### Phase 5: Update Server-Side Code
- [ ] **File**: `supabase/functions/server/index.tsx`
  - Remove quiet hours from default preferences (lines 38-39)
  - Remove from preference fields (lines 461-462)
  - Update any server-side logic that references quiet hours

### Phase 6: Implement Work Hours as Quiet Time Logic
- [ ] **File**: `utils/gapLogic.tsx`
  - Add helper function to check if current time is within work hours
  - Update gap creation logic to respect work hours for all time-based decisions
  - Add logic to suppress activities outside work hours

- [ ] **File**: `components/PlannerContent.tsx`
  - Update gap filtering to use work hours instead of quiet hours
  - Ensure gaps are only shown during work hours

- [ ] **File**: `components/PlannerTimeline.tsx`
  - Update timeline logic to respect work hours
  - Filter gaps and activities based on work hours

### Phase 7: Update Notification Logic (Future Implementation)
- [ ] **Create utility function**: `utils/notificationUtils.ts`
  ```typescript
  export function isWithinWorkHours(currentTime: Date, preferences: UserPreferences): boolean {
    // Check if current time is within work hours
    // Return false if outside work hours (quiet time)
  }
  
  export function shouldSendNotification(currentTime: Date, preferences: UserPreferences): boolean {
    // Only send notifications during work hours
    return isWithinWorkHours(currentTime, preferences);
  }
  ```

- [ ] **Update notification components** (when implemented):
  - Use work hours to determine when to send notifications
  - Suppress notifications outside work hours

### Phase 8: Database Migration
- [ ] **File**: `supabase/functions/server/index.tsx`
  - Add migration logic to remove `quiet_hours_start` and `quiet_hours_end` from existing user preferences
  - Ensure no data loss during migration

## New Logic Implementation

### Work Hours as Single Source of Truth
```typescript
// Instead of checking quiet hours
if (isWithinQuietHours(currentTime)) {
  // Don't send notification
}

// Use work hours as the source of truth
if (!isWithinWorkHours(currentTime)) {
  // Don't send notification (quiet time)
  // Don't create gaps
  // Don't suggest activities
  // Don't allow scheduling
}
```

### Helper Functions to Implement
```typescript
// Check if time is within work hours
function isWithinWorkHours(time: Date, preferences: UserPreferences): boolean {
  const workStart = timeToMinutes(preferences.calendar_work_start);
  const workEnd = timeToMinutes(preferences.calendar_work_end);
  const currentMinutes = time.getHours() * 60 + time.getMinutes();
  
  return currentMinutes >= workStart && currentMinutes < workEnd;
}

// Check if time is quiet time (outside work hours)
function isQuietTime(time: Date, preferences: UserPreferences): boolean {
  return !isWithinWorkHours(time, preferences);
}
```

## Testing Checklist
- [ ] Verify work hours are properly respected for gap creation
- [ ] Verify gaps are only created during work hours
- [ ] Verify activities are only suggested during work hours
- [ ] Test with different work hour configurations
- [ ] Verify no gaps are created outside work hours
- [ ] Test notification suppression outside work hours (when implemented)
- [ ] Verify settings UI no longer shows quiet hours
- [ ] Test migration for existing users with quiet hours preferences
- [ ] Verify work hours validation still works correctly

## Benefits
1. **Simplified UX**: One time range to manage instead of two
2. **Reduced Complexity**: No overlap validation needed
3. **Clearer Logic**: Work hours = active time, non-work hours = quiet time
4. **Less Code**: Remove quiet hours from types, validation, UI, and storage
5. **Better Alignment**: Matches the app's core purpose (work/productivity scheduling)
6. **Consistent Behavior**: All time-based features use the same logic

## Risk Assessment
- **Low Risk**: Quiet hours aren't currently used in app logic
- **Migration**: Need to ensure existing user preferences are handled gracefully
- **Testing**: Comprehensive testing required to ensure work hours logic works correctly

## Estimated Effort
- **Development**: 3-4 hours
- **Testing**: 2-3 hours
- **Total**: 5-7 hours

## Dependencies
- None - this is a self-contained refactoring task

## Notes
- This change will simplify the codebase significantly
- Work hours become the single source of truth for all time-based decisions
- The app's behavior will be more predictable and aligned with its purpose
- Future notification features can easily use work hours for quiet time logic 