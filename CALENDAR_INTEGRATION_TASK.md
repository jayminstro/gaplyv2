# Calendar Integration Implementation Task

## Overview
Implement native device calendar integration into the gap logic system to automatically subtract busy times from available scheduling gaps.

## Codebase Review Summary

### Current State
✅ **Existing Foundation**
- Basic Capacitor calendar bridge plugin (`src/plugins/calendar-bridge.ts`)
- iOS calendar utilities (`src/utils/calendarSource.ios.ts`) 
- Device calendar preferences in types and constants:
  - `show_device_calendar_busy: false`
  - `show_device_calendar_titles: false` 
  - `device_calendar_included_ids: []`
- Preference change detection already includes device calendar fields as "medium" impact
- Comprehensive gap logic system (`utils/gapLogic.tsx`, `utils/gapsAPI.tsx`)
- Advanced storage/caching infrastructure (`utils/storage/`)

⚠️ **Missing Pieces**
- No calendar busy block types defined
- No calendar event normalization pipeline
- No busy block subtraction in gap logic
- No calendar caching layer
- No incremental sync management
- No deduplication logic
- No scheduling conflict validation

### Architecture Assessment
- **Gap Logic**: Well-structured with `GapLogic` class and `GapsAPI` 
- **Storage**: Sophisticated caching with `EnhancedStorageManager`, `MemoryCache`, etc.
- **Preferences**: Robust change detection and validation system
- **UI**: Timeline components (`TodayTimeline.tsx`, `PlannerTimeline.tsx`) ready for integration
- **Native Bridge**: Basic calendar plugin exists, needs expansion

## Implementation Tasks

### Phase 1: Core Types & Normalization (2-3 days)

#### 1.1 Calendar Types Definition
**File**: `types/calendar.ts` (new)
```typescript
type CalendarBusyBlock = {
  date: string;                   // 'YYYY-MM-DD' in prefs.timezone
  start_time: string;             // 'HH:mm' local to prefs.timezone  
  end_time: string;               // 'HH:mm'
  source: 'device'|'google';
  calendarId?: string;
  title?: string;                 // honor show_device_calendar_titles
  isAllDay?: boolean;
  uid?: string;                   // provider UID for deduplication
  recurrenceId?: string;          // expanded instance id if recurring
  transparency?: 'busy'|'free'|'oof'|'tentative';
  status?: 'confirmed'|'tentative'|'cancelled';
  lastSyncedAt: string;           // our ingest timestamp
};
```

**File**: `utils/constants.tsx` (update)
- Add calendar integration preferences:
  - `calendar_all_day_block_mode: 'workday' | 'window' | 'ignore'`
  - `calendar_all_day_fixed_block_minutes: 30`
  - `calendar_all_day_fixed_block_start: 'start'|'middle'|'end'`
  - `calendar_block_tentative: false`
  - `calendar_block_needs_action: false`
  - `calendar_dedupe_strategy: 'auto'|'prefer_google'|'prefer_device'|'none'`
  - `planning_slot_minutes: 15`
  - `debugCalendarSync: false`

#### 1.2 Calendar Event Normalization
**File**: `utils/calendar/normalizer.ts` (new)
```typescript
class CalendarNormalizer {
  static expandAllDay(event, timezone, preferences): CalendarBusyBlock[]
  static filterByTransparency(blocks, preferences): CalendarBusyBlock[]  
  static mergeOverlaps(blocks): CalendarBusyBlock[]
  static centerAllDayInWindow(workStart, workEnd, blockMinutes, gridSize): {start, end}
}
```

#### 1.3 Extend Gap Logic
**File**: `utils/gapLogic.tsx` (update)
- Add `applyBusyToGaps(gaps: TimeGap[], busyBlocks: CalendarBusyBlock[]): TimeGap[]`
- Integrate into `recalculateGapsForDate()` flow
- Maintain idempotent rebuild: base → tasks → busy → optimize

### Phase 2: Device Calendar Provider (3-4 days)

#### 2.1 Enhanced Calendar Bridge
**File**: `src/plugins/calendar-bridge.ts` (update)
- Add transparency/availability fields to `NativeEvent`
- Add incremental sync support (etag/updatedAt if available)
- Add calendar account metadata for deduplication

#### 2.2 Device Calendar Provider
**File**: `utils/calendar/deviceProvider.ts` (new)
```typescript
class DeviceCalendarProvider {
  async getBusyBlocks(dateRange, preferences): Promise<CalendarBusyBlock[]>
  async getCalendars(): Promise<CalendarInfo[]>
  async requestPermission(): Promise<boolean>
  private normalizeEvent(nativeEvent, preferences): CalendarBusyBlock[]
}
```

#### 2.3 Calendar Caching Layer
**File**: `utils/calendar/cache.ts` (new)
```typescript
class CalendarCache {
  async getBusyBlocks(date: string): Promise<CalendarBusyBlock[]>
  async setBusyBlocks(date: string, blocks: CalendarBusyBlock[]): Promise<void>
  async invalidateDate(date: string): Promise<void>
  async cleanup(rollingWindow): Promise<void>
}
```

### Phase 3: Sync Management & Deduplication (3-4 days)

#### 3.1 Incremental Sync Manager
**File**: `utils/calendar/syncManager.ts` (new)
```typescript
class CalendarSyncManager {
  async incrementalSync(source, cursor): Promise<SyncResult>
  async fullSync(source, dateRange): Promise<SyncResult>
  shouldFullSync(lastSync, preferences): boolean
  private handleSyncFailure(error): Promise<void>
}
```

#### 3.2 Deduplication Engine
**File**: `utils/calendar/deduplicator.ts` (new)
```typescript
class CalendarDeduplicator {
  detectMirroredCalendars(deviceCals, googleAccount): string[]
  deduplicateEvents(blocks, strategy): {kept: CalendarBusyBlock[], dropped: DedupDecision[]}
  private analyzeSeriesComplexity(deviceInstances, googleInstances): {complexity: number, shouldSkip: boolean}
}
```

#### 3.3 Calendar Service Orchestrator
**File**: `utils/calendar/index.ts` (new)
```typescript
class CalendarService {
  async getBusyBlocks(dateRange: DateRange, prefs: UserPreferences): Promise<CalendarBusyBlock[]>
  async getAvailableGaps(date: string, prefs: UserPreferences): Promise<TimeGap[]>
  async validateScheduling(candidate: TimeSlot, date: string): Promise<ValidationResult>
  async suggestAlternatives(candidate: TimeSlot): Promise<Suggestion[]>
}
```

### Phase 4: Integration & Validation (2-3 days)

#### 4.1 Gap API Integration
**File**: `utils/gapsAPI.tsx` (update)
- Wire `CalendarService` into `getGapsForDate()` and `getGapsInRollingWindow()`
- Respect `show_device_calendar_busy` preference
- Handle offline fallback to cached busy blocks

#### 4.2 Scheduling Validation
**File**: `utils/validation/schedulingValidator.ts` (new)
```typescript
async function getBlockingIntervals(date, prefs): Promise<Interval[]>
function canSchedule(candidate, blocking): boolean
function suggestAlternatives(candidate, blocking, gaps): Suggestion[]
```

#### 4.3 Preference Integration
**File**: `utils/storage/PreferenceChangeDetector.ts` (update)
- Add new calendar preferences to appropriate impact levels
- Add device calendar fields to "critical" if needed

### Phase 5: UI Integration (2-3 days)

#### 5.1 Timeline Components
**File**: `components/TodayTimeline.tsx` & `components/PlannerTimeline.tsx` (update)
- Optional: Add subtle busy block overlays when `show_device_calendar_titles` is true
- Update gap rendering to handle calendar-modified gaps

#### 5.2 Scheduling Modal Updates
**File**: `components/ActivitySchedulingModal.tsx` (update)
- Integrate scheduling validation
- Show conflict messages with calendar event details (respecting title privacy)
- Suggest alternative time slots

#### 5.3 Settings Integration
**File**: `components/SettingsContent.tsx` (update)
- Add calendar sync status indicator
- Add debug sync report export
- Wire calendar preference toggles to gap recalculation

### Phase 6: Testing & Polish (2-3 days)

#### 6.1 Test Suite
**File**: `utils/calendar/__tests__/` (new directory)
- Unit tests for normalization pipeline
- DST boundary tests (Europe/London spring/fall)
- Deduplication correctness tests
- Property-based tests for gap subtraction
- Timezone conversion edge cases

#### 6.2 Debug Infrastructure
**File**: `utils/calendar/debug.ts` (new)
- Structured logging with privacy protection
- Sync health checks
- Performance monitoring
- "Copy sync report" functionality

#### 6.3 Error Handling & Offline
- Graceful permission denial handling
- Network failure recovery with exponential backoff
- Stale data indicators
- Cache corruption recovery

## Implementation Sequence

### Week 1: Foundation
- [ ] Calendar types and constants
- [ ] Normalization pipeline
- [ ] Basic gap logic integration
- [ ] Device provider skeleton

### Week 2: Core Integration  
- [ ] Complete device calendar provider
- [ ] Calendar caching layer
- [ ] Gap logic busy subtraction
- [ ] Basic sync management

### Week 3: Advanced Features
- [ ] Incremental sync with cursors
- [ ] Deduplication engine
- [ ] Scheduling validation
- [ ] Preference change triggers

### Week 4: Polish & Testing
- [ ] UI integration
- [ ] Comprehensive testing
- [ ] Debug infrastructure
- [ ] Performance optimization

## Success Criteria

### Functional Requirements
- [ ] Device calendar events automatically reduce available gaps
- [ ] All-day events handled per user preference (workday/window/ignore)
- [ ] Tentative/declined events respected per user settings
- [ ] Scheduling conflicts detected and alternatives suggested
- [ ] Preference changes trigger appropriate gap recalculation
- [ ] Offline functionality with cached busy blocks

### Performance Requirements  
- [ ] Gap recalculation completes within 500ms for 14-day window
- [ ] Incremental sync reduces data transfer by >80% vs full sync
- [ ] Memory usage bounded (LRU cache with limits)
- [ ] Battery impact minimal (efficient sync scheduling)

### Privacy Requirements
- [ ] Calendar titles never stored/logged when `show_device_calendar_titles` is false
- [ ] Only specified calendars accessed via `device_calendar_included_ids`
- [ ] Permission denial handled gracefully with clear retry path

### Reliability Requirements
- [ ] No data loss during deduplication
- [ ] Graceful handling of recurring event exceptions  
- [ ] DST transitions handled correctly
- [ ] Network failures don't break gap functionality

## Risk Mitigation

### High Risk Items
1. **DST/Timezone complexity** → Comprehensive test fixtures for Europe/London
2. **Deduplication false positives** → Conservative defaults, complexity guards
3. **Performance with large calendars** → Rolling window limits, efficient caching
4. **iOS permission UX** → Clear rationale, retry mechanisms

### Rollout Strategy
1. **Feature flag**: `show_device_calendar_busy` defaults to `false`
2. **Gradual enablement**: Test with power users first
3. **Monitoring**: Track sync success rates, performance metrics
4. **Fallback**: Always preserve existing gap functionality if calendar integration fails

## Dependencies

### External
- iOS EventKit permissions from user
- Capacitor calendar plugin stability
- Network connectivity for Google integration (future)

### Internal  
- No breaking changes to existing gap logic
- Backward compatibility with current preferences
- Existing storage/caching infrastructure

## Future Extensions (Out of Scope)

- Google Calendar free/busy server endpoint
- Android Calendar Provider support  
- Two-way sync (creating events from scheduled tasks)
- Travel time buffer calculations
- Exchange/Outlook direct integration
- ICS file import/export

## Acceptance Testing

### Manual Test Cases
1. Enable device calendar → verify gaps reduce on days with events
2. Toggle all-day handling → verify behavior changes appropriately  
3. Change included calendars → verify gaps update within sync interval
4. Schedule task in busy time → verify conflict detection and suggestions
5. Go offline → verify cached busy blocks still work
6. DST transition day → verify gap times remain correct

### Automated Test Coverage
- [ ] >90% code coverage for calendar utilities
- [ ] All DST edge cases covered
- [ ] Property-based tests for gap subtraction correctness
- [ ] Performance benchmarks for sync operations

---

**Estimated Total Effort**: 3-4 weeks for complete implementation
**Critical Path**: Types → Normalization → Device Provider → Gap Integration → Testing
**Success Metric**: Users can schedule tasks without calendar conflicts, gaps automatically reflect calendar busy times
