# CalendarBridge Plugin Setup Guide

This guide covers setting up the native iOS EventKit integration for Gaply.

## Overview

The CalendarBridge plugin provides native iOS calendar access through EventKit, allowing the app to:
- Request calendar permissions
- List available calendars
- Fetch calendar events
- Show busy time as read-only overlays in the Planner

## Files Added/Modified

### iOS Native Files
- `ios/App/App/CalendarBridge/CalendarBridge.swift` - Main plugin implementation
- `ios/App/App/CalendarBridge/CalendarBridgePlugin.m` - Objective-C bridge for Capacitor
- `ios/App/App/Info.plist` - Added NSCalendarsUsageDescription

### TypeScript/JavaScript Files
- `native/CalendarBridge.ts` - Capacitor plugin bindings
- `utils/calendarSource.ios.ts` - iOS calendar source adapter
- `utils/platform.ts` - Platform detection utility
- `types/index.tsx` - Added CalendarSource and BusyBlock interfaces
- `components/SettingsContent.tsx` - Integrated device calendar settings
- `components/DeviceCalendarPickerModal.tsx` - Real calendar selection modal

## Build Steps

### 1. iOS Build Setup

```bash
# Navigate to iOS project
cd ios/App

# Install CocoaPods dependencies
pod install

# Open the workspace in Xcode
open App.xcworkspace
```

### 2. Xcode Configuration

1. **Add CalendarBridge files to project:**
   - Right-click on the App folder in Xcode
   - Select "Add Files to App"
   - Add both `CalendarBridge.swift` and `CalendarBridgePlugin.m`

2. **Verify Info.plist:**
   - Ensure `NSCalendarsUsageDescription` is present with the value:
     "Gaply uses your calendar to show busy time as read‑only overlays."

3. **Build the project:**
   - Select your target device/simulator
   - Press Cmd+B to build
   - Resolve any compilation errors

### 3. Web Build

```bash
# From project root
npm run build
```

## Testing

### iOS Simulator Testing

1. **Run on iOS Simulator:**
   ```bash
   npm run ios
   ```

2. **Test Calendar Permissions:**
   - Open Settings app in simulator
   - Navigate to Privacy & Security > Calendars
   - Ensure Gaply has calendar access

3. **Test Plugin Methods:**
   - Open Gaply app
   - Go to Settings > Schedule
   - Toggle "Show device calendar as busy (read‑only)"
   - Should request calendar permission
   - After granting, should show calendar list

### Console Testing

1. **Test Permission Status:**
   ```javascript
   // In browser console or app
   import { CalendarBridge } from './native/CalendarBridge';
   
   const status = await CalendarBridge.getPermissionStatus();
   console.log('Permission status:', status);
   ```

2. **Test Calendar Listing:**
   ```javascript
   const calendars = await CalendarBridge.listCalendars();
   console.log('Available calendars:', calendars);
   ```

3. **Test Event Fetching:**
   ```javascript
   const events = await CalendarBridge.listEvents({
     startISO: '2025-01-01T00:00:00Z',
     endISO: '2025-01-02T00:00:00Z'
   });
   console.log('Events found:', events);
   ```

## Plugin Methods

### getPermissionStatus()
Returns current calendar permission status:
- `granted` - Full access
- `denied` - User denied access
- `restricted` - System restricted
- `not_determined` - Not yet requested

### requestAccess()
Requests calendar permission from user. Returns `{ granted: boolean }`.

### listCalendars()
Returns list of available calendars with:
- `id` - Unique calendar identifier
- `title` - Calendar name
- `colorHex` - Calendar color
- `isSubscribed` - Whether calendar is subscribed
- `allowsModifications` - Whether calendar can be modified

### listEvents(opts)
Fetches events between start and end dates:
- `startISO` - Start date in ISO8601 format
- `endISO` - End date in ISO8601 format
- `calendarIds` - Optional array of calendar IDs to filter by

Returns events with:
- `id` - Event identifier
- `calendarId` - Calendar ID
- `calendarTitle` - Calendar name
- `icalUID` - iCal UID if available
- `allDay` - Whether event is all-day
- `startLocalISO` - Start time in local timezone
- `endLocalISO` - End time in local timezone
- `dateLocal` - Date in YYYY-MM-DD format

## Troubleshooting

### Common Issues

1. **Plugin not found:**
   - Ensure CalendarBridge files are added to Xcode project
   - Check that Objective-C bridge is properly configured
   - Verify Capacitor plugin registration

2. **Permission denied:**
   - Check Info.plist has correct usage description
   - Verify permission request flow in Settings
   - Test on device (simulator may have different behavior)

3. **Build errors:**
   - Ensure EventKit framework is linked
   - Check Swift/Objective-C bridging headers
   - Verify Capacitor version compatibility

### Debug Steps

1. **Check plugin registration:**
   ```javascript
   console.log('Capacitor plugins:', window.Capacitor?.Plugins);
   ```

2. **Verify native methods:**
   ```javascript
   console.log('CalendarBridge methods:', Object.getOwnPropertyNames(CalendarBridge));
   ```

3. **Test platform detection:**
   ```javascript
   import { detectPlatform } from './utils/platform';
   console.log('Platform:', detectPlatform());
   ```

## Next Steps

This implementation provides the foundation for device calendar integration. Future enhancements could include:

1. **Gap Integration:** Use fetched events to subtract busy time from available gaps
2. **Real-time Updates:** Listen for calendar changes and update gaps accordingly
3. **Calendar Sync:** Sync selected calendars with user preferences
4. **Performance Optimization:** Cache calendar data and implement smart refresh

## Security Notes

- Calendar data never leaves the device
- All access is read-only
- Permissions are requested explicitly from user
- No calendar data is transmitted to external services
