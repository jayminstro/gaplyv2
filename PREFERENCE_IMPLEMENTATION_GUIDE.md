# Preference Implementation Guide

## Quick Start

### 1. Using the Optimized Preference Hook

```typescript
import { usePreferences, useCriticalPreferences } from '../hooks/usePreferences';

function MyComponent() {
  // For full preferences with loading states
  const { 
    preferences, 
    isLoading, 
    error, 
    updatePreferences 
  } = usePreferences(storage);

  // For critical preferences only (always available)
  const criticalPrefs = useCriticalPreferences(storage);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Work hours: {preferences?.calendar_work_start} - {preferences?.calendar_work_end}</p>
      <p>Critical work hours: {criticalPrefs.calendar_work_start} - {criticalPrefs.calendar_work_end}</p>
    </div>
  );
}
```

### 2. Direct PreferenceManager Usage

```typescript
import { PreferenceManager } from '../utils/storage/PreferenceManager';

// Get singleton instance
const preferenceManager = PreferenceManager.getInstance(storage);

// Get full preferences
const preferences = await preferenceManager.getPreferences();

// Get critical preferences only (fast)
const criticalPrefs = preferenceManager.getCriticalPreferences();

// Save preferences
await preferenceManager.savePreferences(newPreferences);

// Force refresh from server
await preferenceManager.refresh();
```

### 3. Validation Usage

```typescript
import { usePreferenceValidation } from '../hooks/usePreferences';

function SettingsComponent() {
  const { preferences } = usePreferences(storage);
  const validation = usePreferenceValidation(preferences);

  return (
    <div>
      {!validation.isValid && (
        <div className="error">
          <h3>Validation Errors:</h3>
          <ul>
            {validation.errors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      
      {validation.warnings.length > 0 && (
        <div className="warning">
          <h3>Warnings:</h3>
          <ul>
            {validation.warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Migration from Old System

### Before (Old Way)
```typescript
// ❌ Multiple loading points
const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

useEffect(() => {
  const loadPrefs = async () => {
    try {
      const prefs = await storage.getPreferences();
      if (prefs) setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences');
    }
  };
  loadPrefs();
}, []);

// ❌ No validation
// ❌ No critical field prioritization
// ❌ Short cache TTL
```

### After (New Way)
```typescript
// ✅ Single loading point with optimization
const { preferences, criticalPreferences, isLoading, error } = usePreferences(storage);

// ✅ Critical preferences always available
const criticalPrefs = useCriticalPreferences(storage);

// ✅ Built-in validation
const validation = usePreferenceValidation(preferences);

// ✅ 24-hour cache TTL
// ✅ Intelligent fallback strategy
```

## Performance Best Practices

### 1. Use Critical Preferences for Immediate Access

```typescript
// ✅ Good: Use critical preferences for gap creation
function GapCreationComponent() {
  const criticalPrefs = useCriticalPreferences(storage);
  
  // These are always available, no loading state needed
  const gaps = createGaps(criticalPrefs.calendar_work_start, criticalPrefs.calendar_work_end);
  
  return <div>{/* Render gaps immediately */}</div>;
}
```

### 2. Lazy Load Full Preferences

```typescript
// ✅ Good: Load full preferences only when needed
function SettingsComponent() {
  const { preferences, isLoading } = usePreferences(storage, {
    loadOnMount: false // Don't load until component mounts
  });

  if (isLoading) return <div>Loading settings...</div>;
  
  return <div>{/* Render full settings */}</div>;
}
```

### 3. Batch Preference Updates

```typescript
// ✅ Good: Batch multiple preference changes
function SettingsForm() {
  const { updatePreferences } = usePreferences(storage);
  
  const handleSubmit = async (formData) => {
    // Update all preferences at once
    await updatePreferences({
      calendar_work_start: formData.workStart,
      calendar_work_end: formData.workEnd,
      calendar_working_days: formData.workingDays,
      dark_mode: formData.darkMode
    });
  };
}
```

### 4. Handle Errors Gracefully

```typescript
// ✅ Good: Graceful error handling
function AppComponent() {
  const { preferences, error, criticalPreferences } = usePreferences(storage, {
    onError: (error) => {
      console.error('Preference error:', error);
      // Show user-friendly error message
      toast.error('Settings temporarily unavailable');
    }
  });

  // Always have critical preferences available
  const workHours = criticalPreferences.calendar_work_start;
  
  if (error) {
    return <div>Using default settings due to error</div>;
  }
}
```

## Configuration Options

### PreferenceManager Configuration

```typescript
const preferenceManager = PreferenceManager.getInstance(storage, {
  memoryTTL: 24 * 60 * 60 * 1000, // 24 hours
  validationEnabled: true,
  criticalFields: [
    'calendar_work_start',
    'calendar_work_end',
    'calendar_working_days',
    'calendar_include_weekends',
    'calendar_min_gap'
  ],
  defaultFallback: true
});
```

### Hook Configuration

```typescript
const { preferences } = usePreferences(storage, {
  loadOnMount: true,           // Load on component mount
  criticalOnly: false,         // Load full preferences
  refreshInterval: 3600000,    // Auto-refresh every hour
  onError: (error) => {        // Custom error handler
    console.error('Preference error:', error);
  }
});
```

## Testing

### Unit Testing

```typescript
import { PreferenceManager } from '../utils/storage/PreferenceManager';

describe('PreferenceManager', () => {
  let mockStorage;
  let preferenceManager;

  beforeEach(() => {
    mockStorage = {
      getPreferences: jest.fn(),
      savePreferences: jest.fn()
    };
    preferenceManager = PreferenceManager.getInstance(mockStorage);
  });

  test('should load preferences from storage', async () => {
    const mockPrefs = { calendar_work_start: '09:00' };
    mockStorage.getPreferences.mockResolvedValue(mockPrefs);

    const result = await preferenceManager.getPreferences();
    expect(result).toEqual(mockPrefs);
  });
});
```

### Integration Testing

```typescript
import { renderHook } from '@testing-library/react-hooks';
import { usePreferences } from '../hooks/usePreferences';

describe('usePreferences', () => {
  test('should provide critical preferences immediately', () => {
    const { result } = renderHook(() => usePreferences(mockStorage));
    
    expect(result.current.criticalPreferences.calendar_work_start).toBeDefined();
    expect(result.current.criticalPreferences.calendar_work_end).toBeDefined();
  });
});
```

## Troubleshooting

### Common Issues

1. **Preferences not loading**
   - Check if storage is properly initialized
   - Verify network connectivity for server sync
   - Check browser console for errors

2. **Validation errors**
   - Ensure all critical fields are present
   - Check time format (HH:MM or HH:MM:SS)
   - Verify work hours logic (start < end)

3. **Cache issues**
   - Clear cache: `preferenceManager.clearCache()`
   - Force refresh: `preferenceManager.refresh()`
   - Check memory usage

### Debug Mode

```typescript
// Enable debug logging
const preferenceManager = PreferenceManager.getInstance(storage, {
  debug: true // Enable console logging
});

// Check cache status
console.log('Cache status:', preferenceManager.isLoaded());
console.log('Critical prefs:', preferenceManager.getCriticalPreferences());
```

## Performance Monitoring

### Key Metrics to Track

```typescript
// Monitor preference loading performance
const startTime = performance.now();
const preferences = await preferenceManager.getPreferences();
const loadTime = performance.now() - startTime;

console.log(`Preference load time: ${loadTime}ms`);

// Monitor cache hit rate
const cacheHitRate = preferenceManager.getCacheHitRate();
console.log(`Cache hit rate: ${cacheHitRate}%`);
```

This implementation guide provides everything needed to migrate to and use the optimized preference system effectively. 