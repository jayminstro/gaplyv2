# Gaply - Intelligent Time-Blocking & Task Management

A comprehensive mobile-first task management and time-blocking application with intelligent gap detection, calendar synchronization, and smart activity suggestions. Features a sleek, modern design aesthetic similar to Apple Health and Headspace, optimized for iOS and PWA experiences.

## 🌟 Features

### 📱 Core Functionality
- **Intelligent Time-Blocking**: Automatically detect and manage time gaps in your schedule with simplified three-tier priority system (manual > calendar > default)
- **Smart Task Management**: Create, organize, and track tasks with categories (Overdue, Today, Upcoming, Draft)
- **Google Calendar Integration**: Seamless OAuth 2.0 sync with automatic gap detection from calendar data
- **Interactive Timeline**: Visual timeline with intelligent stacking, proximity-based grouping, and overflow prevention
- **Gap Utilization Modal**: Transform free time into productive sessions with activity suggestions and duration validation
- **Work Hours Banner**: Smart display system that shows completion banners when outside work hours

### ⏱️ Advanced Timer System
- **High-Fidelity Timer Modal**: Circular progress indicators with modern control buttons
- **Floating Timer**: Minimized timer with progress ring that stays accessible during task execution
- **Global Timer Management**: Seamless timer handoff between components with real-time updates
- **Session Tracking**: Track completion rates and time spent on different activities

### 🎯 Smart Activity Management
- **Activity Stack Modal**: Handles overlapping activities with intelligent stacking behavior
- **Proximity-Based Grouping**: Reduces visual clutter by grouping activities scheduled close together
- **Calendar Scheduling**: Option to add activities to Google Calendar when creating or scheduling tasks
- **Duration Validation**: Ensures tasks fit within available time gaps

### 🔄 Data Management & Architecture
- **Real-time Sync**: Live updates across all components with proper state management
- **Complete User Isolation**: Row Level Security ensures users only see their own data
- **Relational Database**: Proper foreign key relationships linking all user data through user_id references
- **Timestamptz Handling**: Proper timestamp formatting for database storage and frontend display
- **Simplified Gap Logic**: Streamlined gap creation and management system with 14-day rolling window

### 🎨 Mobile-Optimized Experience
- **Touch-First Design**: Enhanced touch scrolling with momentum and native feel, no scrollbars
- **iOS Native Integration**: Capacitor-based iOS app with device calendar access
- **PWA Ready**: Progressive Web App capabilities with widget shortcuts and offline support
- **Widget Mode**: Compact widget view accessible via URL parameter (?widget=true)
- **Responsive Design**: Adaptive layout optimized for mobile devices with enhanced touch interactions

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling with design tokens
- **shadcn/ui** as the primary design system
- **Lucide React** for icons
- **Framer Motion** for animations
- **Sonner** for toast notifications

### Backend & Infrastructure
- **Supabase** for backend services and database
- **Hono** web server for edge functions
- **PostgreSQL** with Row Level Security
- **OAuth 2.0** for Google Calendar integration
- **Capacitor** for native iOS app capabilities

### Development Tools
- **Vite** for build tooling
- **TypeScript** for type safety
- **ESLint** for code quality
- **Vitest** for testing

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- Google Cloud Console account (for calendar integration)
- iOS development tools (for native app)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/gaply.git
   cd gaply
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file with your Supabase and Google credentials:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_PROJECT_ID=your_supabase_project_id
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SUPABASE_URL=your_supabase_url
   
   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   ```

4. **Database Setup**
   The application uses a proper relational database structure with the following Supabase tables:
   - `user_preferences` - User settings, work hours, and calendar preferences
   - `tasks` - Task management with timestamptz due dates and scheduling
   - `gaps` - Simplified time gap management (available time slots only)
   - `explore` - Activity suggestions and discovery
   - `activity_completions` - Completion tracking and analytics
   
   All tables use Row Level Security (RLS) and are linked through user_id foreign key relationships.

5. **Google Calendar Integration** (Required for Full Functionality)
   - Set up OAuth 2.0 credentials in Google Cloud Console
   - Configure redirect URIs in Supabase Auth settings
   - Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables
   - Follow the [Supabase Auth Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
   - **Important**: Without proper Google OAuth setup, users will see "provider is not enabled" errors

6. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
├── App.tsx                 # Main application component with global state
├── components/             # React components
│   ├── ui/                # shadcn/ui components
│   ├── figma/             # Figma-specific components  
│   ├── HomeContent.tsx    # Dashboard with timeline and summary
│   ├── ActivitiesContent.tsx # Task management with categories
│   ├── SettingsContent.tsx   # User preferences and work hours
│   ├── TodayTimeline.tsx     # Smart timeline with stacking and banners
│   ├── GapUtilizationModal.tsx # Gap scheduling with validation
│   ├── ActivityStackModal.tsx  # Overlapping activity handler
│   ├── DayCompleteBanner.tsx   # Work hours completion banner
│   ├── TimerModal.tsx        # High-fidelity Pomodoro timer
│   ├── FloatingTimer.tsx     # Minimized global timer
│   ├── WidgetView.tsx        # PWA widget mode
│   ├── CategorizedTasks.tsx  # Task organization by status
│   ├── MobileOptimizations.tsx # Enhanced mobile touch and PWA features
│   ├── CalendarSync.tsx      # Google Calendar integration
│   └── DeviceCalendarPickerModal.tsx # iOS device calendar selection
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions and helpers
│   ├── api.tsx           # API integration layer with retry logic
│   ├── gapsAPI.tsx       # Gap management logic
│   ├── gapLogic.tsx      # Simplified gap creation and management
│   ├── helpers.tsx       # Common helper functions
│   ├── storage/          # Enhanced storage management system
│   ├── localFirst/       # Offline-first capabilities
│   └── supabase/         # Supabase client configuration
├── supabase/functions/   # Backend edge functions
│   └── make-server-966d4846/ # Hono web server with API endpoints
├── styles/               # Global CSS and design tokens
├── native/               # Capacitor native bridge
└── guidelines/           # Development guidelines
```

## 🔧 Development

### Key Components

- **TodayTimeline**: Visual timeline with intelligent activity stacking, proximity-based grouping, and work hours banner
- **GapUtilizationModal**: Interface for scheduling activities in time gaps with duration validation
- **ActivityStackModal**: Handles overlapping activities with bottom slide-up animation
- **DayCompleteBanner**: Smart banner system for before/after work hours
- **TaskTile**: Reusable task display component with timer integration
- **CategorizedTasks**: Organized task views (Overdue, Today, Upcoming, Draft) with proper time sorting
- **CalendarSync**: Google Calendar integration with OAuth 2.0 and automatic gap detection
- **TimerModal**: High-fidelity timer with circular progress and modern controls
- **FloatingTimer**: Minimized timer with progress ring and global state management
- **WidgetView**: Compact widget mode for PWA shortcuts
- **MobileOptimizations**: Enhanced touch scrolling, PWA meta tags, and iOS optimizations

### Data Flow & Architecture

1. **Authentication**: Supabase Auth with session management and user metadata
2. **Task Management**: Full CRUD operations with proper timestamptz date handling
3. **Simplified Gap Logic**: Streamlined gap creation system with automatic gap splitting when tasks are scheduled
4. **Real-time Updates**: Debounced saves and live synchronization across all components
5. **Timeline Rendering**: Smart time conversion helpers for consistent HH:MM format handling
6. **Mobile Optimizations**: Enhanced touch scroll handling, iOS-compatible notifications, and PWA support
7. **Offline-First**: Local storage fallbacks with enhanced storage management

### API Endpoints

The backend provides RESTful endpoints via Hono web server:
- `/make-server-966d4846/tasks` - Task CRUD operations with timestamptz support
- `/make-server-966d4846/gaps` - Time gap management and calendar integration
- `/make-server-966d4846/preferences` - User settings and work hours
- `/make-server-966d4846/google-calendar` - Calendar sync and OAuth handling
- `/make-server-966d4846/explore` - Activity suggestions

## 🎨 Design System

### Color Palette
- Primary: Blue gradients (`from-blue-600 to-purple-600`)
- Success: Green tones (`text-green-400`)
- Warning: Orange/Amber (`text-orange-400`)
- Error: Red tones (`text-red-400`)
- Neutral: Slate variants (`bg-slate-900`, `text-slate-400`)

### Typography
- Default typography settings in `styles/globals.css`
- No manual font size/weight classes unless specifically needed
- Consistent spacing using Tailwind's spacing scale

## 🔒 Security

- **Row Level Security**: All user data is properly isolated
- **Authentication**: Secure JWT token-based auth via Supabase
- **Data Validation**: Input validation on both client and server
- **CORS**: Properly configured for secure API access
- **Environment Variables**: All sensitive configuration moved to environment variables
- **No Hardcoded Secrets**: Supabase credentials are properly externalized
- **Secure Token Handling**: Access tokens managed through secure session management

## 🚀 Deployment

### Frontend Deployment
The application can be deployed to any static hosting service:
- **Vercel** (recommended for automatic deployments)
- **Netlify** (excellent for PWA features)
- **GitHub Pages** (for simple static hosting)

**Important**: Ensure environment variables are properly configured in your hosting platform.

### Backend Deployment
- **Supabase Edge Functions**: Automatically deployed when you push to your Supabase project
- **Database Schema**: Use the provided SQL migrations to set up tables with proper RLS
- **OAuth Configuration**: Ensure Google OAuth redirect URIs match your deployment URLs

### PWA Deployment Considerations
- Requires HTTPS for full PWA functionality
- Configure manifest.json for widget shortcuts
- Test widget mode with ?widget=true parameter
- Ensure proper service worker caching for offline support

### iOS Native App
- **Capacitor Build**: Use `npx cap build ios` to build native iOS app
- **Xcode Integration**: Open `ios/App/App.xcworkspace` in Xcode
- **Device Calendar**: Requires proper permissions and entitlements
- **App Store**: Follow Apple's guidelines for app submission

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and TypeScript patterns
- Use the provided shadcn/ui components when possible
- Maintain mobile-first design principles with touch optimization
- Write descriptive commit messages
- Test thoroughly on mobile devices (iOS Safari, Chrome Android)
- Avoid manual font-size/weight classes unless specifically needed (use globals.css defaults)
- Ensure all user data is properly scoped with Row Level Security
- Use proper timestamptz handling for date/time fields
- Follow the simplified gap logic system for time management
- Test PWA functionality and widget mode

### Code Style & Architecture

- Use TypeScript for all new components with proper type definitions
- Follow React best practices (hooks, functional components, proper state management)
- Use Tailwind CSS with design tokens from globals.css
- Maintain component modularity and reusability
- Implement proper error boundaries and loading states
- Use debounced saves for real-time updates to avoid excessive API calls
- Follow the established folder structure and naming conventions
- Ensure proper mobile scrolling with enhanced touch optimization
- Implement offline-first capabilities with local storage fallbacks

## 📋 Recent Updates & Improvements

### ✅ Completed Features
- ✅ **Simplified Preferences**: Removed redundant calendar_include_weekends and quiet_hours preferences
- ✅ **Enhanced Mobile Experience**: Improved touch scrolling, PWA meta tags, and iOS optimizations
- ✅ **Offline-First Architecture**: Local storage fallbacks and enhanced storage management
- ✅ **Device Calendar Integration**: iOS device calendar access with picker modal
- ✅ **Simplified Gap Logic**: Streamlined gap creation with 14-day rolling window
- ✅ **Enhanced API Layer**: Retry logic, session management, and better error handling
- ✅ **Work hours banner system** with smart timeline replacement
- ✅ **Activity stack modal** with bottom slide-up animation and proper spacing
- ✅ **Google Calendar integration** with optional activity scheduling
- ✅ **Fixed gap time format handling** for consistent HH:MM display
- ✅ **Repositioned notifications** above navigation bar for iOS compatibility
- ✅ **Widget mode functionality** with PWA shortcuts and URL parameter support
- ✅ **Comprehensive gap logic** with simplified three-tier priority system
- ✅ **Proper timestamptz handling** between database and frontend
- ✅ **Task categorization** with real-time sorting and status management

### 🔮 Future Roadmap

- [ ] Advanced AI activity suggestions with machine learning
- [ ] Team collaboration and shared calendars
- [ ] Multiple calendar provider support (Outlook, Apple Calendar)
- [ ] Advanced analytics dashboard with productivity insights
- [ ] Voice commands and enhanced accessibility
- [ ] Android native app version
- [ ] Advanced offline capabilities with sync conflict resolution
- [ ] Advanced calendar features (recurring events, reminders)
- [ ] Enhanced PWA features and offline support

## 🐛 Known Issues & Considerations

### Setup Requirements
- Google Calendar sync requires manual OAuth 2.0 credential setup in Google Cloud Console
- Missing Google OAuth credentials will result in "provider is not enabled" errors
- Widget mode requires specific URL parameter (?widget=true) to activate
- iOS native app requires proper device calendar permissions

### Technical Limitations
- Timer accuracy may vary on background tabs due to browser throttling
- Some edge cases in gap splitting logic under heavy concurrent usage
- Mobile keyboard may affect modal positioning on smaller screens
- Calendar sync is currently one-way (Gaply → Google Calendar) for task creation

### Browser Compatibility
- Optimized for modern mobile browsers (Chrome, Safari, Edge)
- PWA features require HTTPS for full functionality
- Clipboard API requires user permission for widget URL sharing
- iOS Safari has enhanced support with Capacitor integration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for the excellent component library
- [Supabase](https://supabase.com/) for the comprehensive backend platform
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide](https://lucide.dev/) for the beautiful icon set
- [Capacitor](https://capacitorjs.com/) for native mobile app capabilities

---

**Built with ❤️ for productivity enthusiasts who want to make the most of their time.**