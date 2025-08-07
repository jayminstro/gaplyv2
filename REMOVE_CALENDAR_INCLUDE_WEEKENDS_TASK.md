# Task: Remove Redundant `calendar_include_weekends` Boolean Preference

## Overview
Remove the redundant `calendar_include_weekends` boolean preference since the `WorkingDaysSelector` component already provides full control over which days are working days, including weekends.

## Problem Statement
Currently, there are two ways to control weekend inclusion:
1. **WorkingDaysSelector**: Allows users to select/deselect any day including weekends
2. **calendar_include_weekends boolean**: Redundant boolean that overrides weekend selection

This creates confusion and redundant logic in the gap creation system.

## Current Redundant Logic
```typescript
// First check: Working days array
if (!workingDaysArray.includes(currentDay)) {
  return []; // Skip non-working days
}

// Second check: Weekend boolean (REDUNDANT)
if (!preferences.calendar_include_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
  return []; // Skip weekends
}
```

## Implementation Plan

### Phase 1: Remove from Types and Defaults
- [ ] **File**: `types/index.tsx`
  - Remove `calendar_include_weekends: boolean;` from UserPreferences interface

- [ ] **File**: `utils/constants.tsx`
  - Remove `calendar_include_weekends: false,` from DEFAULT_PREFERENCES

### Phase 2: Remove from UI
- [ ] **File**: `components/SettingsContent.tsx`
  - Remove the "Include Weekends" SettingRow component
  - Remove `calendar_include_weekends` from localPreferences state
  - Remove from change detection logic

### Phase 3: Simplify Gap Logic
- [ ] **File**: `utils/gapLogic.tsx`
  - Remove weekend check logic (lines 171-174)
  - Keep only the working days array check
  - Remove `calendar_include_weekends` from debug logging
  - Update `handleWorkingTimeChange` method to remove weekend logic

- [ ] **File**: `supabase/functions/server/index.tsx`
  - Remove weekend check logic (line 2231)
  - Remove `calendar_include_weekends` from server-side gap creation

### Phase 4: Update Components
- [ ] **File**: `components/PlannerContent.tsx`
  - Remove weekend check logic (lines 92-95)
  - Remove `calendar_include_weekends` from debug logging
  - Update gap filtering logic

- [ ] **File**: `components/PlannerTimeline.tsx`
  - Remove any weekend-specific filtering logic
  - Ensure gap filtering only uses working days array

### Phase 5: Update Storage and Preferences
- [ ] **File**: `hooks/usePreferences.tsx`
  - Remove `calendar_include_weekends` from preference keys
  - Remove from default preference initialization
  - Remove from preference validation

- [ ] **File**: `utils/storage/PreferenceManager.ts`
  - Remove `calendar_include_weekends` from critical fields
  - Remove from default preferences
  - Remove from preference validation logic

- [ ] **File**: `utils/storage/PreferenceChangeDetector.ts`
  - Remove `calendar_include_weekends` from change detection
  - Remove from preference change handling

- [ ] **File**: `utils/storage/EnhancedStorageManager.ts`
  - Remove `calendar_include_weekends` from storage operations

### Phase 6: Update Validation
- [ ] **File**: `utils/api/preferenceValidation.ts`
  - Remove weekend validation logic (lines 293-297)
  - Remove `calendar_include_weekends` from validation rules
  - Update logical validation to only check working days array

### Phase 7: Database Migration (if needed)
- [ ] **File**: `supabase/functions/server/index.tsx`
  - Add migration logic to remove `calendar_include_weekends` from existing user preferences
  - Ensure existing users' weekend preferences are preserved in `calendar_working_days`

## Migration Strategy
For existing users who have `calendar_include_weekends: false`:
1. Check their current `calendar_working_days` array
2. If weekends are not in the array, keep them excluded
3. If weekends are in the array but `calendar_include_weekends` is false, remove weekends from the array
4. Delete the `calendar_include_weekends` field

## Testing Checklist
- [ ] Verify gap creation works correctly for weekdays
- [ ] Verify gap creation works correctly when weekends are selected in WorkingDaysSelector
- [ ] Verify gap creation is skipped when weekends are deselected in WorkingDaysSelector
- [ ] Test with existing users who had `calendar_include_weekends: false`
- [ ] Test with existing users who had `calendar_include_weekends: true`
- [ ] Verify no gaps are created for non-working days
- [ ] Test weekend selection/deselection in WorkingDaysSelector
- [ ] Verify settings UI no longer shows "Include Weekends" option

## Benefits
1. **Simplified Logic**: Single source of truth for working days
2. **Better UX**: Direct control through WorkingDaysSelector
3. **Reduced Complexity**: Fewer preferences to manage
4. **Clearer Intent**: Obvious which days are working days
5. **Easier Maintenance**: Less code to maintain and debug

## Risk Assessment
- **Low Risk**: The WorkingDaysSelector already handles weekend selection
- **Migration**: Need to ensure existing user preferences are preserved
- **Testing**: Comprehensive testing required to ensure no regression

## Estimated Effort
- **Development**: 2-3 hours
- **Testing**: 1-2 hours
- **Total**: 3-5 hours

## Dependencies
- None - this is a self-contained refactoring task

## Notes
- The WorkingDaysSelector component is already well-designed and handles weekend selection perfectly
- This change will simplify the codebase and improve user experience
- No new features needed - just removal of redundant code 