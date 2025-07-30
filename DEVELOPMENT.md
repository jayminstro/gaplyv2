# Local Development Setup

This guide helps you run the Gaply mobile app in local development mode.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Open the App**
   - Visit `http://localhost:3000` in your browser
   - The app will run in development mode with local fallbacks

## Development Mode Features

### API Fallbacks
- **Gap Management**: Creates local default gaps when API is unavailable
- **Data Storage**: Uses localStorage for development data persistence
- **Error Handling**: Graceful fallbacks for missing backend services

### Local Storage Keys
The app uses these localStorage keys for development data:
- `gaply_gaps_YYYY-MM-DD`: Daily gap data
- Other user data is stored in memory during the session

### Expected Behaviors

#### Normal Operations (Works Without Backend)
- ✅ User authentication (via Supabase)
- ✅ Gap creation and display
- ✅ Task management
- ✅ Timer functionality
- ✅ Settings management
- ✅ Widget mode

#### Limited Operations (Requires Backend)
- ⚠️ Google Calendar sync
- ⚠️ Gap splitting for task scheduling
- ⚠️ Cross-device data synchronization
- ⚠️ Activity suggestions from server

## Environment Detection

The app automatically detects development mode and:
- Shows helpful console messages prefixed with 🔧
- Uses local fallbacks for missing APIs
- Provides offline-first functionality

## Console Messages

Look for these indicators in your browser console:

### Normal Development Messages
```
🔧 Development mode - using local fallback for gaps
🔧 Development mode - gaps saved to local storage as fallback
✅ Created 3 local fallback gaps for 2024-XX-XX
```

### Troubleshooting Messages
```
🔄 API unavailable, using local fallback gaps
🔄 Gap initialization handled by API fallback system
```

## Troubleshooting

### "404 Not Found" Errors
These are expected in local development and indicate:
- Backend functions are not running (normal for frontend-only development)
- App is using local fallbacks (this is working correctly)

### No Data Showing
1. Check browser console for error messages
2. Clear localStorage: `localStorage.clear()`
3. Refresh the page
4. Check that you're signed in

### Authentication Issues
1. Ensure you have valid Supabase credentials
2. Check network connectivity
3. Try signing out and back in

### Performance
- The app is optimized for mobile devices
- Use Chrome DevTools mobile emulation for best development experience
- Test touch interactions using device mode

## Production Deployment

For production deployment, you'll need to:
1. Set up Supabase backend functions
2. Configure proper environment variables
3. Deploy to a production hosting service
4. Update API endpoints in configuration

## Mobile Testing

For the best development experience:
1. Open Chrome DevTools (F12)
2. Click the device toggle button
3. Select a mobile device profile
4. Test touch interactions and scrolling

The app is designed as a mobile-first PWA and works best in mobile viewport sizes.