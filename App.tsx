import { useState, useEffect, useRef } from 'react';
import { preferencesAPI, tasksAPI, tasksAPIExtended, profileAPI } from './utils/api';
import { GapsAPI } from './utils/gapsAPI';
import { GapLogic, mergeAndDeduplicateGaps } from './utils/gapLogic';
import { supabase } from './utils/supabase/client';
import { toast } from 'sonner';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { SignUpScreen } from './components/SignUpScreen';
import { HomeContent } from './components/HomeContent';
import { ActivitiesContent } from './components/ActivitiesContent';
import { PlannerContent } from './components/PlannerContent';
import { SettingsContent } from './components/SettingsContent';
import { MobileOptimizations } from './components/MobileOptimizations';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CalendarDevScreen } from './components/CalendarDevScreen';
import { Toaster } from './components/ui/sonner';
import { Home as HomeIcon, Activity, Settings, Calendar } from 'lucide-react';
import { TimerModal } from "./components/TimerModal";
import { EditTaskModal } from "./components/EditTaskModal";
import { FloatingTimer } from "./components/FloatingTimer";
import { GapUtilizationModal } from "./components/GapUtilizationModal";
import { WidgetView } from './components/WidgetView';
import { Task, TimeGap, UserPreferences } from './types/index';
import { DEFAULT_PREFERENCES, DEFAULT_UNSAVED_CHANGES } from './utils/constants';
import { sanitizeTasks } from './utils/helpers';
import { debugDataSaving as _debugDataSaving } from './utils/debug';
import { debounce } from './utils/debounce';
import { EnhancedStorageManager } from './utils/storage/EnhancedStorageManager';
import { EnhancedLoginSyncService } from './utils/localFirst/EnhancedLoginSyncService';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [gaps, setGaps] = useState<TimeGap[]>([]);
  
  // Gap utilization state
  const [selectedGap, setSelectedGap] = useState<TimeGap | null>(null);
  const [isGapModalOpen, setIsGapModalOpen] = useState(false);
  const [isExternalGapModalOpen, setIsExternalGapModalOpen] = useState(false);

  // Listen for modal open events from nested components (e.g., TodayTimeline)
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const ce = e as CustomEvent<{ type: string; open: boolean }>;
        if (ce.detail?.type === 'gap-utilization') {
          setIsExternalGapModalOpen(!!ce.detail.open);
        }
      } catch {}
    };
    window.addEventListener('ui:modalOpen', handler as EventListener);
    return () => window.removeEventListener('ui:modalOpen', handler as EventListener);
  }, []);
  
  // Authentication state
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  
  // Data loading state
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Settings state - moved here to avoid conditional hook calls
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [profile, setProfile] = useState<any>(null);
  const preferencesRef = useRef<UserPreferences>(DEFAULT_PREFERENCES);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);

  const [_editingProfile, setEditingProfile] = useState(false);

  // Track unsaved changes per section
  const [_unsavedChanges, setUnsavedChanges] = useState(DEFAULT_UNSAVED_CHANGES);

  // Activities state - moved here to avoid conditional hook calls
  const [currentActivitiesTab, setCurrentActivitiesTab] = useState('discover'); // used elsewhere for UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // Widget mode detection
  const [isWidgetMode, setIsWidgetMode] = useState(false);
  
  // Offline state detection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Local-first service
  const [localFirstService, setLocalFirstService] = useState<EnhancedStorageManager | null>(null);
  const [loginSyncService, setLoginSyncService] = useState<EnhancedLoginSyncService | null>(null);

  // App lifecycle state
  const [isAppInitialized, setIsAppInitialized] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isAppVisible, setIsAppVisible] = useState(true); // used by lifecycle handlers
  
  // Daily cleanup state
  const [lastCleanupDate, setLastCleanupDate] = useState<string>('');

  // Sync local tasks with server
  const syncLocalTasks = async () => {
    if (!localFirstService) return;

    try {
      console.log('🔄 Syncing local tasks with server...');
      
      // Get local tasks
      const localTasks = await localFirstService.getTasks();
      
      // Get server tasks
      const serverTasks = await tasksAPI.get();
      
      // Compare and sync tasks that are newer locally
      for (const localTask of localTasks) {
        const serverTask = serverTasks.find((t: Task) => t.id === localTask.id);
        
        if (!serverTask) {
          // Task doesn't exist on server, create it
          console.log(`📝 Creating new task on server: ${localTask.title}`);
          await tasksAPIExtended.create(localTask);
          continue;
        }
        
        const localDate = new Date(localTask.updated_at || 0);
        const serverDate = new Date(serverTask.updated_at || 0);
        
        if (localDate > serverDate) {
          // Local task is newer, update server
          console.log(`🔄 Updating server task with newer local version: ${localTask.title}`);
          await tasksAPIExtended.updateWithTimestamp(localTask.id, localTask);
        }
      }
      
      console.log('✅ Task sync completed');
    } catch (error) {
      console.error('❌ Error syncing tasks:', error);
      // Don't show error to user since local data is still intact
    }
  };

  // Handle online/offline state
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      console.log('🌐 Device is back online');
      toast.success('Back online - syncing changes...');
      syncLocalTasks(); // Sync when coming back online
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log('📱 Device is offline');
      toast.message('Working offline - changes will sync when back online');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [localFirstService]); // Add localFirstService as dependency

  // App lifecycle management - handle background/foreground transitions
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      console.log(`📱 App ${isVisible ? 'foregrounded' : 'backgrounded'}`);
      setIsAppVisible(isVisible);
      
      // When app comes back to foreground, check if we need to refresh data
      if (isVisible && isAppInitialized && isAuthenticated && !isDataLoading) {
        console.log('📱 App returned to foreground - checking for data updates...');
        // Only trigger a light refresh if we've been away for a while
        const lastActiveTime = sessionStorage.getItem('lastActiveTime');
        const now = Date.now();
        const timeSinceLastActive = lastActiveTime ? now - parseInt(lastActiveTime) : 0;
        
        // If more than 5 minutes have passed, do a light refresh
        if (timeSinceLastActive > 5 * 60 * 1000) {
          console.log('📱 App was away for more than 5 minutes - triggering background refresh...');
          // Set a flag to trigger background refresh in the main data loading effect
          sessionStorage.setItem('needsBackgroundRefresh', 'true');
        }
      }
      
      // Update last active time
      sessionStorage.setItem('lastActiveTime', Date.now().toString());
    };

    const handleFocus = () => {
      console.log('📱 App gained focus');
      setIsAppVisible(true);
      sessionStorage.setItem('lastActiveTime', Date.now().toString());
    };

    const handleBlur = () => {
      console.log('📱 App lost focus');
      setIsAppVisible(false);
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Initialize last active time
    sessionStorage.setItem('lastActiveTime', Date.now().toString());

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isAppInitialized, isAuthenticated, isDataLoading]);

  // Daily cleanup job
  useEffect(() => {
    const runDailyCleanup = async () => {
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
      
      // Only run cleanup once per day
      if (lastCleanupDate === today) {
        return;
      }
      
      if (isAuthenticated && session?.access_token && gaps.length > 0) {
        try {
          console.log('🧹 Running daily gap cleanup...');
          const cleanupResult = await GapsAPI.cleanupOldGaps(gaps, session.access_token);
          console.log(`✅ Daily cleanup completed: ${cleanupResult.deleted} old gaps removed`);
          setLastCleanupDate(today);
        } catch (error) {
          console.warn('⚠️ Daily cleanup failed:', error);
        }
      }
    };
    
    // Run cleanup on app start and every 24 hours
    runDailyCleanup();
    
    const cleanupInterval = setInterval(runDailyCleanup, 24 * 60 * 60 * 1000); // 24 hours
    
    return () => clearInterval(cleanupInterval);
  }, [isAuthenticated, session?.access_token, gaps, lastCleanupDate]);

  // Persist app state to sessionStorage to survive background/foreground transitions
  useEffect(() => {
    const saveAppState = () => {
      if (isAuthenticated && user) {
        const appState = {
          isAuthenticated: true,
          userId: user.id,
          activeTab,
          isDataLoading,
          timestamp: Date.now()
        };
        sessionStorage.setItem('gaplyAppState', JSON.stringify(appState));
      }
    };

    // Save state when key values change
    saveAppState();
  }, [isAuthenticated, user, activeTab, isDataLoading]);

  // Restore app state on mount
  useEffect(() => {
    const restoreAppState = () => {
      try {
        const savedState = sessionStorage.getItem('gaplyAppState');
        if (savedState) {
          const appState = JSON.parse(savedState);
          const timeSinceSaved = Date.now() - appState.timestamp;
          
          // Only restore state if it's recent (less than 1 hour old)
          if (timeSinceSaved < 60 * 60 * 1000) {
            console.log('📱 Restoring app state from session storage');
            setActiveTab(appState.activeTab || 'home');
            
            // If we were authenticated, don't show loading screen
            if (appState.isAuthenticated && appState.userId) {
              console.log('📱 User was previously authenticated - skipping loading screen');
              setIsLoading(false);
              setIsAppInitialized(true);
            }
          } else {
            console.log('📱 Saved app state is too old - starting fresh');
            sessionStorage.removeItem('gaplyAppState');
          }
        }
      } catch (error) {
        console.error('📱 Error restoring app state:', error);
        sessionStorage.removeItem('gaplyAppState');
      }
    };

    restoreAppState();
  }, []);

  // Load gaps from localStorage on app start and ensure future dates have gaps
  const hasEnsuredFutureGapsRef = useRef(false);
  useEffect(() => {
    const loadGapsFromLocalStorage = () => {
      try {
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const storedGaps = localStorage.getItem(`gaply_gaps_${todayKey}`);
        
        if (storedGaps) {
          const gaps = JSON.parse(storedGaps);
          console.log(`📱 Loaded ${gaps.length} gaps from localStorage for today`);
          setGaps(prev => {
            // Only update if we don't already have gaps for today
            const hasTodayGaps = prev.some(gap => gap.date === todayKey);
            if (!hasTodayGaps) {
              const mergedGaps = mergeAndDeduplicateGaps(prev, gaps);
              return mergedGaps;
            }
            return prev;
          });
        }
      } catch (error) {
        console.warn('⚠️ Failed to load gaps from localStorage:', error);
      }
    };

    const ensureAllFutureDatesHaveGaps = async () => {
      // Prevent effect-induced loops and redundant runs
      if (hasEnsuredFutureGapsRef.current) {
        return;
      }
      if (!isAuthenticated || !session?.access_token || !preferences) {
        console.log('⚠️ Skipping ensureAllFutureDatesHaveGaps - missing auth or preferences');
        return;
      }

      try {
        console.log('🔄 Ensuring all rolling-window dates have gaps (past and future)...');
        
        // Import GapLogic dynamically
        const { GapLogic, normalizeWorkingDays } = await import('./utils/gapLogic');
        const { window_start, window_end } = GapLogic.calculateRollingWindow();
        
        console.log(`📅 Checking dates in rolling window: ${window_start} to ${window_end}`);
        
        // Use normalizeWorkingDays to handle any format of calendar_working_days
        const workingDays = normalizeWorkingDays(preferences.calendar_working_days);
        console.log('🔍 Debug - Using working days:', workingDays);
        
        // Safeguard: Don't proceed if working days is empty
        if (!workingDays || workingDays.length === 0) {
          console.log('⚠️ Working days is empty, skipping gap creation');
          return;
        }
        
        // Get all dates from the start of the rolling window to the end (includes past)
        // Parse window bounds safely for iOS
        const startDate = new Date(window_start + 'T00:00:00');
        const endDate = new Date(window_end + 'T00:00:00');
        const datesToProcess: string[] = [];
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
          
          // Check if it's a working day
          const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
          if (!workingDays.includes(dayOfWeek)) {
            console.log(`⏸️ Skipping non-working day: ${dateStr} (${dayOfWeek})`);
            continue;
          }
          
          // Check if we already have gaps for this date
          const existingGaps = gaps.filter(gap => gap.date === dateStr);
          if (existingGaps.length > 0) {
            console.log(`✅ Already have ${existingGaps.length} gaps for ${dateStr}`);
            continue;
          }
          
          // Check if gaps exist in localStorage
          const localStorageKey = `gaply_gaps_${dateStr}`;
          const storedGaps = localStorage.getItem(localStorageKey);
          if (storedGaps) {
            try {
              const parsedGaps = JSON.parse(storedGaps);
              console.log(`✅ Found ${parsedGaps.length} gaps in localStorage for ${dateStr}`);
              setGaps(prev => mergeAndDeduplicateGaps(prev, parsedGaps));
              continue;
            } catch (error) {
              console.warn(`⚠️ Failed to parse gaps from localStorage for ${dateStr}:`, error);
            }
          }
          
          datesToProcess.push(dateStr);
        }
        
        console.log(`📅 Found ${datesToProcess.length} future dates that need gaps`);
        
        // Create gaps for all future dates in parallel (but limit concurrency)
        const batchSize = 3; // Process 3 dates at a time
        for (let i = 0; i < datesToProcess.length; i += batchSize) {
          const batch = datesToProcess.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (dateStr) => {
            try {
              console.log(`🔄 Creating gaps for future date: ${dateStr}`);
              
              // Create local fallback gaps
              const { GapsAPI } = await import('./utils/gapsAPI');
              const newGaps = await GapsAPI.createLocalFallbackGaps(
                dateStr, 
                preferences, 
                session?.user?.id || 'local-user', 
                localFirstService
              );
              
              if (newGaps.length > 0) {
                console.log(`✅ Created ${newGaps.length} gaps for future date ${dateStr}`);
                setGaps(prev => mergeAndDeduplicateGaps(prev, newGaps));
              }
            } catch (error) {
              console.error(`❌ Error creating gaps for future date ${dateStr}:`, error);
            }
          }));
          
          // Small delay between batches
          if (i + batchSize < datesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log(`✅ Finished ensuring gaps for all future dates`);
        hasEnsuredFutureGapsRef.current = true;
      } catch (error) {
        console.error('❌ Error ensuring gaps for future dates:', error);
      }
    };

    // Load gaps after a short delay to ensure app is initialized
    const timer = setTimeout(() => {
      loadGapsFromLocalStorage();
      // Ensure future dates have gaps after loading current gaps
      setTimeout(ensureAllFutureDatesHaveGaps, 500);
    }, 1000);
    
    // Listen for manual gap reload events
    const handleForceReloadGaps = (event: CustomEvent) => {
      console.log('🔄 Force reloading gaps from event:', event.detail);
      setGaps(event.detail.gaps);
    };
    
    // Listen for preference change events that require gap recalculation
    const handlePreferenceChange = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { requiresGapRecalculation, affectedDateRange } = customEvent.detail;
      
      if (requiresGapRecalculation && session?.access_token) {
        console.log('🔄 Preference change detected, reloading gaps for affected date range:', affectedDateRange);
        
        try {
          // Reload gaps for the affected date range
          const { GapsAPI } = await import('./utils/gapsAPI');
          const { GapLogic } = await import('./utils/gapLogic');
          
          // Get the rolling window to ensure we have all necessary gaps
          GapLogic.calculateRollingWindow();
          
          // Reload all gaps in the rolling window
          const updatedGaps = await GapsAPI.getGapsInRollingWindow(session.access_token, localFirstService);
          console.log(`🔄 Reloaded ${updatedGaps.length} gaps after preference change`);
          
          // Update the gaps state
          setGaps(updatedGaps);
          
          // Also reload gaps from localStorage for immediate UI update
          const today = new Date().toLocaleDateString('en-CA');
          const todayKey = `gaply_gaps_${today}`;
          const storedGaps = localStorage.getItem(todayKey);
          if (storedGaps) {
            const parsedGaps = JSON.parse(storedGaps);
            console.log(`📱 Reloaded ${parsedGaps.length} gaps from localStorage for today`);
            setGaps(prev => mergeAndDeduplicateGaps(prev, parsedGaps));
          }
          
        } catch (error) {
          console.error('❌ Error reloading gaps after preference change:', error);
        }
      }
    };
    
    window.addEventListener('forceReloadGaps', handleForceReloadGaps as EventListener);
    window.addEventListener('preferenceChange', handlePreferenceChange);
    // Simple navigation event for internal components (e.g., to open Settings)
    const handleNavigateTo = (event: Event) => {
      const custom = event as CustomEvent;
      const tab = custom.detail?.tab;
      if (typeof tab === 'string') {
        setActiveTab(tab);
      }
    };
    window.addEventListener('navigateTo', handleNavigateTo as EventListener);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('forceReloadGaps', handleForceReloadGaps as EventListener);
      window.removeEventListener('preferenceChange', handlePreferenceChange as EventListener);
      window.removeEventListener('navigateTo', handleNavigateTo as EventListener);
    };
  }, [isAuthenticated, session?.access_token, preferences, localFirstService]);

  // Check for widget mode and authentication on app start
  useEffect(() => {
    // Check if widget mode is enabled via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    setIsWidgetMode(urlParams.get('widget') === 'true');

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setIsAuthenticated(true);
          setUser(session.user);
          setSession(session);
          setIsDataLoading(true); // Start data loading for existing session
          setIsAppInitialized(true); // Mark app as initialized
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUser(session.user);
        setSession(session);
        setIsLoading(false);
        setIsDataLoading(true); // Start data loading when user is authenticated
        setIsAppInitialized(true); // Mark app as initialized
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setSession(null);
        setIsLoading(false);
        setIsDataLoading(false);
        setIsAppInitialized(false); // Reset app initialization
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize local-first system with login sync
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const initializeWithLoginSync = async () => {
      try {
        console.log('🔄 Initializing local-first system with login sync...');
        
        // Create enhanced storage manager first (shared instance)
        const enhancedStorage = new EnhancedStorageManager(user.id, {
          storageType: 'auto', // Auto-detect best storage (IndexedDB preferred)
          enableEncryption: true, // Enable encryption for sensitive data
          encryptFields: ['description', 'notes', 'title'], // Encrypt sensitive fields
          enableAnalytics: true, // Enable storage analytics
          enableSync: false, // Disable sync for now (using LoginSyncService instead)
          enableMemoryCache: true, // Enable ultra-fast memory caching
          enablePredictiveCache: true, // Enable AI-driven predictive caching
          enableCacheLimits: true, // Enable intelligent storage management
          analyticsConfig: {
            trackAccessPatterns: true,
            trackSizeChanges: true,
            trackPerformance: true,
            retentionDays: 30,
            sampleRate: 0.1
          },
          memoryCacheConfig: {
            maxSize: 50, // Reduced for iPhone energy efficiency
            defaultTTL: 10 * 60 * 1000, // 10 minutes TTL (reduced for energy)
            enableStats: false, // Disable stats in production for energy savings
            evictionPolicy: 'lru'
          },
          cacheLimits: {
            maxTasks: 1000, // Reduced for iPhone
            maxGaps: 5000, // 7 days worth of gaps
            maxActivities: 500,
            maxStorageSize: 50 * 1024 * 1024, // 50MB (reduced for energy)
            maxMemoryUsage: 50, // 50MB (reduced for iPhone)
            maxCacheEntries: 500, // Reduced for energy
            maxSessionData: 10, // 10MB (reduced for energy)
            cleanupThreshold: 0.7 // More aggressive cleanup
          }
        });
        await enhancedStorage.initialize();
        setLocalFirstService(enhancedStorage);
        
        // Create default gaps for today before running login sync
        console.log('📝 Creating default gaps for today before login sync...');
        
        // First, load the user's actual preferences (not defaults)
        console.log('🔍 Loading user preferences before gap creation...');
        let userPrefs = preferences; // Start with current state (defaults)
        try {
          const loadedPrefs = await enhancedStorage.getPreferences();
          if (loadedPrefs) {
            console.log('✅ Found user preferences:', {
              work_start: loadedPrefs.calendar_work_start,
              work_end: loadedPrefs.calendar_work_end,
              working_days: loadedPrefs.calendar_working_days
            });
            userPrefs = loadedPrefs;
            setPreferences(loadedPrefs); // Update state immediately
          } else {
            console.warn('⚠️ No user preferences found, using defaults for gap creation');
          }
        } catch (prefsError) {
          console.warn('⚠️ Error loading preferences for gap creation:', prefsError);
        }
        
        try {
          const today = new Date().toLocaleDateString('en-CA');
          const todayGaps = await GapsAPI.ensureTodayGaps(userPrefs, session?.access_token || '', user.id, enhancedStorage);
          console.log(`✅ Created ${todayGaps.length} default gaps for today before login sync`);
          
          // Verify gaps were saved with retry logic
          let verificationRetries = 0;
          const maxVerificationRetries = 5;
          while (verificationRetries < maxVerificationRetries) {
            try {
              const savedGaps = await enhancedStorage.getAllGaps();
              console.log(`🔍 Pre-login sync verification: Found ${savedGaps.length} gaps in storage`);
              if (savedGaps.length > 0) {
                break; // Success, exit retry loop
              }
              verificationRetries++;
              if (verificationRetries < maxVerificationRetries) {
                console.log(`⏳ Pre-login sync verification attempt ${verificationRetries} found 0 gaps, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 300 * verificationRetries));
              }
            } catch (verifyError) {
              console.warn('⚠️ Pre-login sync verification failed:', verifyError);
              verificationRetries++;
              if (verificationRetries < maxVerificationRetries) {
                await new Promise(resolve => setTimeout(resolve, 300 * verificationRetries));
              }
            }
          }
          
          // Add a delay to ensure gaps are fully committed before login sync
          console.log('⏳ Waiting for gaps to be fully committed before login sync...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (gapError) {
          console.warn('⚠️ Failed to create default gaps before login sync:', gapError);
        }
        
        // Create login sync service with the same storage instance
        const loginService = new EnhancedLoginSyncService(user.id, enhancedStorage);
        const syncResult = await loginService.initializeAndSync();
        
        if (syncResult.success) {
          console.log('✅ Login sync completed successfully');
          console.log(`📊 Sync summary: ${syncResult.tasksSynced} tasks, ${syncResult.gapsSynced} gaps synced`);
          
          if (syncResult.conflictsResolved > 0) {
            console.log(`🔄 ${syncResult.conflictsResolved} conflicts resolved`);
          }
          
          setLoginSyncService(loginService);
        } else {
          console.warn('⚠️ Login sync completed with warnings:', syncResult.errors);
          setLoginSyncService(loginService); // Still set the service even with warnings
        }
        
        setIsDataLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to initialize local-first system:', error);
        setIsDataLoading(false);
      }
    };

    initializeWithLoginSync();
  }, [isAuthenticated, user?.id]);

  // Realtime subscription to tasks changes for this user (INSERT/UPDATE/DELETE)
  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id || !localFirstService) return;

    const userId = session.user.id;
    console.log('🔔 Subscribing to realtime task changes for user:', userId);

    const channel = supabase.channel(`tasks:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        async (payload) => {
          try {
            if (payload.eventType === 'DELETE') {
              const deletedId = (payload as any)?.old?.id as string | undefined;
              if (deletedId) {
                console.log('🗑️ Realtime delete received for task:', deletedId);
                await localFirstService.deleteTask(deletedId);
                setGlobalTasks(prev => prev.filter(t => t.id !== deletedId));
              }
              return;
            }

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              console.log('🔄 Realtime upsert received, refreshing tasks from server...');
              try {
                const serverTasks = await tasksAPI.get();
                await localFirstService.saveTasks(serverTasks, true);
                setGlobalTasks(serverTasks);
              } catch (refreshError) {
                console.warn('⚠️ Failed to refresh tasks on realtime event:', refreshError);
              }
            }
          } catch (e) {
            console.warn('Realtime handler error:', e);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime channel status:', status);
      });

    return () => {
      try {
        console.log('🔕 Unsubscribing from realtime task changes');
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [isAuthenticated, session?.user?.id, localFirstService]);

  // Battery-aware cache optimization
  useEffect(() => {
    const enableBatteryOptimization = () => {
      // Check battery level periodically
      const batteryCheckInterval = setInterval(() => {
        if ('getBattery' in navigator && typeof navigator.getBattery === 'function') {
          (navigator as any).getBattery().then((battery: any) => {
            if (battery.level < 0.2) { // Below 20%
              // Enable low battery mode
              if (localFirstService) {
                localFirstService.updateConfig({
                  enablePredictiveCache: false,
                  memoryCacheConfig: { maxSize: 10 }
                });
                console.log('🔋 Low battery mode: Reduced cache operations');
              }
            } else if (battery.level > 0.5) { // Above 50%
              // Restore normal cache operations
              if (localFirstService) {
                localFirstService.updateConfig({
                  enablePredictiveCache: true,
                  memoryCacheConfig: { maxSize: 50 }
                });
                console.log('🔋 Normal battery mode: Restored cache operations');
              }
            }
          });
        }
      }, 60000); // Check every minute

      return () => clearInterval(batteryCheckInterval);
    };

    const cleanup = enableBatteryOptimization();
    return cleanup;
  }, [localFirstService]);

  // Load critical data first, then non-critical data in the background
  useEffect(() => {
    if (!loginSyncService || !localFirstService) return;

    const loadCriticalData = async () => {
      try {
        console.log('📱 Loading critical data...');
        
        // Load preferences first to ensure they're available for gap creation
        const preferences = await localFirstService.getPreferences();
        if (preferences) {
          setPreferences(preferences);
          console.log('✅ Preferences loaded for critical data');
        }
        
        // Load only tasks for critical data - gaps will be handled by loadAppData
        const allTasks = await localFirstService.getTasks();
        const today = new Date().toLocaleDateString('en-CA');
        
        console.log(`📋 Today's tasks loaded:`, allTasks.filter(task => task.dueDate === today));
        
        // Set critical data in state
        setGlobalTasks(allTasks);
        
        console.log('✅ Critical data loaded successfully');
      } catch (error) {
        console.error('❌ Error loading critical data:', error);
      }
    };

    const loadNonCriticalData = async () => {
      try {
        // Use requestIdleCallback for background loading
        const requestIdleCallback = (window as any).requestIdleCallback || 
          ((cb: Function) => setTimeout(cb, 1));

        requestIdleCallback(async () => {
          console.log('🔄 Loading non-critical data in background...');
          
          // Load past/future tasks
          const allTasks = await localFirstService.getTasks();
          setGlobalTasks(prev => {
            const uniqueTasks = new Set([...prev, ...allTasks]);
            return Array.from(uniqueTasks);
          });

          // Preferences already loaded in critical data phase
        });
      } catch (error) {
        console.error('⚠️ Error loading non-critical data:', error);
      }
    };

    // Execute critical loading immediately
    loadCriticalData();
    // Start background loading after critical data is loaded with a small delay
    setTimeout(() => {
      loadNonCriticalData();
    }, 100);
  }, [loginSyncService, localFirstService]);

  // Load user preferences and profile data in the background when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const loadUserData = async () => {
      const requestIdleCallback = (window as any).requestIdleCallback || 
        ((cb: Function) => setTimeout(cb, 1));

      requestIdleCallback(async () => {
        try {
          console.log('Loading user data for user:', user.id);
          
          const loadWithRetry = async (apiCall: () => Promise<any>, name: string) => {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const result = await apiCall();
                console.log(`Loaded ${name} on attempt ${attempt + 1}:`, result);
                return result;
              } catch (error) {
                console.error(`Error loading ${name} (attempt ${attempt + 1}):`, error);
                if (attempt === 2) return null; // Last attempt failed
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
              }
            }
          };
          
          // Load preferences first as they're more important
          // Read locally stored preferences first (to preserve local-only fields on merge)
          let localStoredPrefs: UserPreferences | null = null;
          try {
            if (localFirstService) {
              localStoredPrefs = await localFirstService.getPreferences();
            }
          } catch {}

          const prefsData = await loadWithRetry(() => preferencesAPI.get(), 'preferences');
          if (prefsData) {
            // Normalize preferences to ensure proper data types
            const normalizedPrefs = {
              ...prefsData,
              calendar_working_days: (() => {
                if (Array.isArray(prefsData.calendar_working_days)) {
                  return prefsData.calendar_working_days.length > 0 
                    ? prefsData.calendar_working_days 
                    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                }
                if (prefsData.calendar_working_days && typeof prefsData.calendar_working_days === 'object' && Object.keys(prefsData.calendar_working_days).length > 0) {
                  const filtered = Object.keys(prefsData.calendar_working_days).filter(key => prefsData.calendar_working_days[key]);
                  return filtered.length > 0 
                    ? filtered 
                    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                }
                return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
              })(),
              preferred_categories: Array.isArray(prefsData.preferred_categories) 
                ? prefsData.preferred_categories 
                : []
            };
            // Preserve local-only device calendar settings (not stored on server)
            const mergedPrefs = {
              ...normalizedPrefs,
              show_device_calendar_busy: (localStoredPrefs?.show_device_calendar_busy ?? preferencesRef.current?.show_device_calendar_busy) ?? false,
              show_device_calendar_titles: (localStoredPrefs?.show_device_calendar_titles ?? preferencesRef.current?.show_device_calendar_titles) ?? false,
              device_calendar_included_ids: (localStoredPrefs?.device_calendar_included_ids ?? preferencesRef.current?.device_calendar_included_ids) ?? []
            } as UserPreferences;
            setPreferences(mergedPrefs);
          }

          // Load profile data after preferences
          const profileData = await loadWithRetry(() => profileAPI.get(), 'profile');
          if (profileData) {
            setProfile(profileData);
          }
          
          console.log('✅ User data loaded successfully');
        } catch (error) {
          console.error('❌ Error loading user data:', error);
        }
      });
    };

    loadUserData();
  }, [isAuthenticated, user?.id]);

  // Load app data (tasks, gaps) when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const loadAppData = async () => {
      try {
        // Check if this is a background refresh
        const needsBackgroundRefresh = sessionStorage.getItem('needsBackgroundRefresh') === 'true';
        if (needsBackgroundRefresh) {
          console.log('📱 Performing background refresh...');
          sessionStorage.removeItem('needsBackgroundRefresh');
        } else {
          console.log('Loading app data for user:', user.id);
        }
        
        // Check if we're offline
        if (!navigator.onLine) {
          console.log('📱 Device is offline - skipping server sync');
          // Keep using local data
          return;
        }
        
        // Wait for localFirstService to be initialized
        if (!localFirstService) {
          console.log('⏳ Waiting for storage manager to be initialized...');
          return; // Exit early, will be called again when localFirstService is available
        }
        
        console.log('🔍 Storage manager is ready, proceeding with data loading...');
        
        // Wait for login sync to complete if it's still running
        if (loginSyncService) {
          console.log('⏳ Waiting for login sync to complete...');
          // Give login sync a moment to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const loadWithRetry = async (apiCall: () => Promise<any>, name: string, defaultValue: any) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await apiCall();
              console.log(`Loaded ${name} on attempt ${attempt + 1}:`, result);
              return result;
            } catch (error) {
              console.error(`Error loading ${name} (attempt ${attempt + 1}):`, error);
              if (attempt === 2) {
                console.log(`Failed to load ${name} from server - keeping local data`);
                return null; // Return null instead of defaultValue to keep local data
              }
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
        };

        // Load tasks and gaps with retry logic (using rolling window)
        const [tasksData, gapsData] = await Promise.all([
          loadWithRetry(() => tasksAPI.get(), 'tasks', null),
          loadWithRetry(() => GapsAPI.getGapsInRollingWindow(session?.access_token || '', localFirstService), 'gaps', null)
        ]);

        // If no gaps were loaded, create default gaps for today
        let finalGapsData = gapsData;
        let finalTasks: Task[] = [];
        if (!gapsData || gapsData.length === 0) {
          console.log('📝 No gaps found in rolling window, checking if we need to create default gaps for today...');
          try {
            const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
            console.log(`🎯 Checking gaps for today: ${today}`);
            
            // Check if gaps already exist in local storage
            const existingLocalGaps = await localFirstService.getAllGaps();
            const todayGaps = existingLocalGaps.filter(gap => gap.date === today);
            
            if (todayGaps.length > 0) {
              console.log(`✅ Found ${todayGaps.length} existing gaps for today in local storage`);
              finalGapsData = todayGaps;
            } else {
              console.log('📝 No existing gaps found, creating default gaps for today...');
              const newTodayGaps = await GapsAPI.ensureTodayGaps(preferences, session?.access_token || '', session?.user?.id, localFirstService);
              finalGapsData = newTodayGaps;
              console.log(`✅ Created ${newTodayGaps.length} default gaps for today`);
            }
            
            // Verify gaps were saved to storage with retry logic
            let verificationRetries = 0;
            const maxVerificationRetries = 3;
            while (verificationRetries < maxVerificationRetries) {
              try {
                const savedGaps = await localFirstService.getAllGaps();
                console.log(`🔍 Verification: Found ${savedGaps.length} gaps in storage after creation`);
                if (savedGaps.length > 0) {
                  break; // Success, exit retry loop
                }
                verificationRetries++;
                if (verificationRetries < maxVerificationRetries) {
                  console.log(`⏳ Verification attempt ${verificationRetries} found 0 gaps, retrying...`);
                  await new Promise(resolve => setTimeout(resolve, 200 * verificationRetries));
                }
              } catch (verifyError) {
                console.warn('⚠️ Could not verify saved gaps:', verifyError);
                verificationRetries++;
                if (verificationRetries < maxVerificationRetries) {
                  await new Promise(resolve => setTimeout(resolve, 200 * verificationRetries));
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Failed to create default gaps for today:', error);
            finalGapsData = [];
          }
        }

        // Compare server data with local data
        if (tasksData && Array.isArray(tasksData) && localFirstService) {
          const localTasks = await localFirstService.getTasks();
          const sanitizedServerTasks = sanitizeTasks(tasksData);
          
          // Create a map of tasks by ID for easier lookup
          const mergedTasks = new Map<string, Task>();
          
          // First add all local tasks
          localTasks.forEach(task => {
            mergedTasks.set(task.id, task);
          });
          
          // Then merge server tasks, only overwriting if they're newer
          sanitizedServerTasks.forEach(serverTask => {
            const localTask = mergedTasks.get(serverTask.id);
            
            if (!localTask) {
              // Task doesn't exist locally, add it
              mergedTasks.set(serverTask.id, serverTask);
            } else {
              // Compare timestamps
              const serverTimestamp = new Date(serverTask.updated_at || '').getTime();
              const localTimestamp = new Date(localTask.updated_at || '').getTime();
              
              if (serverTimestamp > localTimestamp) {
                // Server task is newer, use it
                mergedTasks.set(serverTask.id, serverTask);
              }
              // Otherwise keep the local task
            }
          });
          
          // Convert map back to array and update state
          finalTasks = Array.from(mergedTasks.values());
          setGlobalTasks(finalTasks);
          
          // Save merged tasks back to local storage
          await localFirstService.saveTasks(finalTasks, true);
          
          console.log('✅ Tasks merged and updated');
        } else {
          console.log('📱 Keeping existing local tasks');
          // Load local tasks for gap recalculation
          if (localFirstService) {
            finalTasks = await localFirstService.getTasks();
            setGlobalTasks(finalTasks);
          }
        }

        // Handle gaps with rolling window and cleanup
        if (finalGapsData && Array.isArray(finalGapsData) && localFirstService) {
          // Clean up old gaps first
          try {
            const cleanupResult = await GapsAPI.cleanupOldGaps(finalGapsData, session?.access_token || '');
            console.log(`🧹 Cleanup completed: ${cleanupResult.deleted} old gaps removed`);
          } catch (error) {
            console.warn('⚠️ Gap cleanup failed:', error);
          }
          
          // Recalculate gaps to account for existing tasks
          let recalculatedGaps = finalGapsData;
          if (finalTasks && finalTasks.length > 0 && preferences) {
            try {
              console.log('🔄 Recalculating gaps to account for existing tasks...');
              
              // Group tasks by date
              const tasksByDate = new Map<string, Task[]>();
              for (const task of finalTasks) {
                if (task.dueDate) {
                  if (!tasksByDate.has(task.dueDate)) {
                    tasksByDate.set(task.dueDate, []);
                  }
                  tasksByDate.get(task.dueDate)!.push(task);
                }
              }
              
              // Recalculate gaps for each date that has tasks
              const newGaps: TimeGap[] = [];
              for (const [date, dateTasks] of tasksByDate) {
                if (dateTasks.length > 0) {
                  console.log(`🔄 Recalculating gaps for ${date} with ${dateTasks.length} tasks`);
                  const recalculatedDateGaps = GapLogic.recalculateGapsForDate(
                    date,
                    dateTasks,
                    preferences!, // We know preferences is defined here due to the if check above
                    session?.user?.id || 'local-user'
                  );
                  newGaps.push(...recalculatedDateGaps);
                }
              }
              
              // Add gaps for dates that don't have tasks (keep original gaps)
              const datesWithTasks = new Set(tasksByDate.keys());
              for (const gap of finalGapsData) {
                if (!datesWithTasks.has(gap.date)) {
                  newGaps.push(gap);
                }
              }
              
              recalculatedGaps = newGaps;
              console.log(`✅ Recalculated gaps: ${recalculatedGaps.length} total gaps`);
            } catch (gapError) {
              console.warn('⚠️ Failed to recalculate gaps for existing tasks:', gapError);
              // Keep original gaps if recalculation fails
            }
          }
          
          // Save recalculated gaps to local storage
          console.log('💾 Saving recalculated gaps to local storage...');
          for (const gap of recalculatedGaps) {
            await localFirstService.saveGaps([gap], gap.date || new Date().toISOString().split('T')[0]);
          }
          console.log('✅ Recalculated gaps saved to local storage');
          
          // Set recalculated gaps in state
          setGaps(recalculatedGaps);
          console.log(`✅ Loaded ${recalculatedGaps.length} recalculated gaps for rolling window`);
          
          // Preload gaps for smooth scrolling (background task)
          setTimeout(async () => {
            try {
              await GapsAPI.preloadGaps(preferences, session?.access_token || '');
            } catch (error) {
              console.warn('⚠️ Gap preloading failed:', error);
            }
          }, 1000);
        } else {
          // Try to load from local storage if server data is not available
          if (localFirstService) {
            try {
              // Load all gaps from local storage to get the full rolling window
              const allLocalGaps = await localFirstService.getAllGaps();
              
              // Recalculate gaps to account for existing tasks even when loading from local storage
              let recalculatedLocalGaps = allLocalGaps;
              if (finalTasks && finalTasks.length > 0 && preferences) {
                try {
                  console.log('🔄 Recalculating local gaps to account for existing tasks...');
                  
                  // Group tasks by date
                  const tasksByDate = new Map<string, Task[]>();
                  for (const task of finalTasks) {
                    if (task.dueDate) {
                      if (!tasksByDate.has(task.dueDate)) {
                        tasksByDate.set(task.dueDate, []);
                      }
                      tasksByDate.get(task.dueDate)!.push(task);
                    }
                  }
                  
                  // Recalculate gaps for each date that has tasks
                  const newGaps: TimeGap[] = [];
                  for (const [date, dateTasks] of tasksByDate) {
                    if (dateTasks.length > 0) {
                      console.log(`🔄 Recalculating local gaps for ${date} with ${dateTasks.length} tasks`);
                      const recalculatedDateGaps = GapLogic.recalculateGapsForDate(
                        date,
                        dateTasks,
                        preferences!, // We know preferences is defined here due to the if check above
                        session?.user?.id || 'local-user'
                      );
                      newGaps.push(...recalculatedDateGaps);
                    }
                  }
                  
                  // Add gaps for dates that don't have tasks (keep original gaps)
                  const datesWithTasks = new Set(tasksByDate.keys());
                  for (const gap of allLocalGaps) {
                    if (!datesWithTasks.has(gap.date)) {
                      newGaps.push(gap);
                    }
                  }
                  
                  recalculatedLocalGaps = newGaps;
                  console.log(`✅ Recalculated local gaps: ${recalculatedLocalGaps.length} total gaps`);
                } catch (gapError) {
                  console.warn('⚠️ Failed to recalculate local gaps for existing tasks:', gapError);
                  // Keep original gaps if recalculation fails
                }
              }
              
              setGaps(recalculatedLocalGaps);
              console.log(`📱 Using ${recalculatedLocalGaps.length} recalculated gaps from local storage`);
            } catch (error) {
              console.log('📱 No local gaps available');
              setGaps([]);
            }
          } else {
            console.log('📱 No local storage service available');
            setGaps([]);
          }
        }

        console.log('✅ App data sync completed');
      } catch (error) {
        console.error('❌ Error during app data sync:', error);
        console.log('📱 Keeping existing local data');
      }
    };

    // Add a small delay to ensure critical data loads first
    setTimeout(() => {
      loadAppData();
    }, 200);
  }, [isAuthenticated, user?.id, session?.access_token, localFirstService]);

  const handleAuthSuccess = async () => {
    console.log('Auth success called, waiting for session...');
    // Wait a moment for the session to be established
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify we have a session before proceeding
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        console.log('Session confirmed, setting authenticated state');
        setIsAuthenticated(true);
        setUser(session.user);
        setSession(session);
        setIsDataLoading(true); // Start data loading
      } else {
        console.error('No session found after auth success');
        // Try once more with a longer delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession?.access_token) {
          console.log('Session confirmed on retry');
          setIsAuthenticated(true);
          setUser(retrySession.user);
          setSession(retrySession);
          setIsDataLoading(true); // Start data loading
        } else {
          console.error('Still no session after retry');
        }
      }
    } catch (error) {
      console.error('Error verifying session after auth success:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      // Clean up services
      if (localFirstService) {
        // Clean up simple service if needed
      }
      if (loginSyncService) {
        await loginSyncService.cleanup();
      }

      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setSession(null);
      setLocalFirstService(null);
      
      // Reset all state
      setGlobalTasks([]);
      setGaps([]);
      setPreferences(DEFAULT_PREFERENCES);
      setProfile(null);
      setEditingProfile(false);
      setUnsavedChanges(DEFAULT_UNSAVED_CHANGES);
      setCurrentActivitiesTab('discover');
      setEditingTask(null);
      setIsNewTaskModalOpen(false);
      setIsDataLoading(false);

      toast.success('Signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      toast.error('Sign out failed');
    }
  };

  // Settings helper functions
  const _updatePreference = (key: string, value: any, section: string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setUnsavedChanges(prev => ({ ...prev, [section]: true }));
  };

  const _saveSection = async (section: string) => {
    if (!isAuthenticated || !user?.id) {
      console.error('Cannot save: user not authenticated');
      toast.error('Please sign in to save preferences');
      return;
    }

    try {
      console.log(`Saving ${section} for user:`, user.id);
      
      // Save to local storage first
      if (localFirstService) {
        console.log(`💾 Saving ${section} preferences to local storage...`);
        await localFirstService.savePreferences(preferences);
        console.log(`✅ ${section} preferences saved to local storage`);
      }

      // Then sync to remote API
      try {
        console.log(`🌐 Syncing ${section} preferences to remote API...`);
        {
          const { filterServerEligiblePrefs } = await import('./utils/storage/filterServerEligiblePrefs');
          await preferencesAPI.save(filterServerEligiblePrefs(preferences));
        }
        console.log(`✅ ${section} preferences synced to remote API`);
      } catch (apiError) {
        console.error(`⚠️ Failed to sync ${section} to remote API, but local save succeeded:`, apiError);
        // Don't show error to user since local save worked
      }

      setUnsavedChanges(prev => ({ ...prev, [section]: false }));
      toast.success('Preferences saved');
    } catch (error) {
      console.error(`Error saving ${section} preferences for user:`, user.id, error);
      toast.error(`Failed to save ${section}`);
    }
  };

  const updatePreferencesFromSettings = (newPreferences: UserPreferences) => {
    setPreferences(newPreferences);
  };

  // Debounced save function for tasks
  const debouncedSaveTasks = debounce(async (tasks: Task[]) => {
    if (!isAuthenticated || !user?.id) {
      console.error('Cannot save tasks: user not authenticated');
      return;
    }

    try {
      console.log('Saving tasks to server...');
      await tasksAPI.save(tasks);
      console.log('✅ Tasks saved successfully');
    } catch (error) {
      console.error('❌ Error saving tasks:', error);
      toast.error('Failed to save tasks');
    }
  }, 2000); // Debounce for 2 seconds

  // Enhanced timer update handler
  const handleGlobalTimerUpdate = async (task: Task, isRunning: boolean, remaining: number, total?: number) => {
    try {
      const updatedTask = {
        ...task,
        isTimerRunning: isRunning,
        timerRemaining: remaining,
        timerTotal: total || task.timerTotal
      };

      // Update in local state immediately for UI responsiveness
      setGlobalTasks(prev => 
        prev.map(t => t.id === task.id ? updatedTask : t)
      );

      // Save to local database
      if (localFirstService) {
        await localFirstService.updateTask(task.id, updatedTask);
      }

      // Debounced save to prevent excessive API calls
      debouncedSaveTasks(globalTasks);
    } catch (error) {
      console.error('❌ Error updating timer:', error);
      toast.error('Failed to save timer progress');
    }
  };

  const handleFloatingTimerExpand = () => {
    if (timerTask) {
      setTimerTask(timerTask);
      setIsTimerModalOpen(true);
    }
  };

  // Enhanced task creation handler
  const handleTaskCreated = async (task: Task) => {
    try {
      if (localFirstService) {
        console.log(`📝 Creating task: ${task.title}`);
        
        // Save the new task
        await localFirstService.saveTask(task);
        
        // Optimistically update tasks list to avoid cache staleness across devices
        setGlobalTasks(prev => {
          const updated = [...prev.filter(t => t.id !== task.id), task];
          return updated;
        });
        // Also fetch fresh tasks from storage to align caches
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        // Recalculate gaps for the task's date to split around the new task
        if (task.dueDate && preferences) {
          try {
            console.log(`🔄 Recalculating gaps after task creation for ${task.dueDate}`);
            const recalculatedGaps = GapLogic.recalculateGapsForDate(
              task.dueDate,
              tasks,
              preferences,
              session?.user?.id || 'local-user'
            );
            
            if (recalculatedGaps.length > 0) {
              // Save the recalculated gaps
              await localFirstService.saveGaps(recalculatedGaps, task.dueDate);
              
              // Update gaps state
              const currentGaps = gaps.filter(gap => gap.date !== task.dueDate);
              const updatedGaps = [...currentGaps, ...recalculatedGaps];
              setGaps(updatedGaps);
              
              console.log(`✅ Recalculated and saved ${recalculatedGaps.length} gaps for ${task.dueDate}`);
            }
          } catch (gapError) {
            console.warn('⚠️ Failed to recalculate gaps after task creation:', gapError);
            // Don't fail the task creation if gap recalculation fails
          }
        }

        console.log(`✅ Task created: ${task.title}`);

        // If online, immediately sync the newly created task to the server (upsert)
        if (navigator.onLine) {
          try {
            console.log('🔄 Syncing new task with server...');
            await tasksAPIExtended.updateWithTimestamp(task.id, {
              ...task,
              updated_at: new Date().toISOString(),
            });
            console.log('✅ Task created synced with server');
          } catch (syncError) {
            console.warn('⚠️ Failed to sync new task with server - will sync later:', syncError);
          }
        } else {
          // Show offline indicator if offline
          toast.success('Task created (offline - will sync when online)');
        }
      }
      else {
        // Fallback when storage service not ready: still update UI gaps locally
        setGlobalTasks(prev => [...prev, task]);
        if (task.dueDate && preferences) {
          try {
            const localTasks = [...globalTasks, task];
            const recalculatedGaps = GapLogic.recalculateGapsForDate(
              task.dueDate,
              localTasks,
              preferences,
              session?.user?.id || 'local-user'
            );
            if (recalculatedGaps.length > 0) {
              const currentGaps = gaps.filter(gap => gap.date !== task.dueDate);
              setGaps([...currentGaps, ...recalculatedGaps]);
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('❌ Error creating task:', error);
      toast.error('Failed to create task');
    }
  };

  // Enhanced task update handler with offline support
  const handleTaskUpdated = async (task: Task) => {
    try {
      if (localFirstService) {
        // Add updated_at timestamp
        const updatedTask = {
          ...task,
          updated_at: new Date().toISOString()
        };
        
        console.log(`📝 Updating task: ${updatedTask.title}`);
        
        // Save the updated task locally
        await localFirstService.saveTask(updatedTask);
        
        // Get all tasks and update local state
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        // Recalculate gaps for the task's date to split around the updated task
        if (task.dueDate && preferences) {
          try {
            console.log(`🔄 Recalculating gaps after task update for ${task.dueDate}`);
            const recalculatedGaps = GapLogic.recalculateGapsForDate(
              task.dueDate,
              tasks,
              preferences,
              session?.user?.id || 'local-user'
            );
            
            if (recalculatedGaps.length > 0) {
              // Save the recalculated gaps
              await localFirstService.saveGaps(recalculatedGaps, task.dueDate);
              
              // Update gaps state
              const currentGaps = gaps.filter(gap => gap.date !== task.dueDate);
              const updatedGaps = [...currentGaps, ...recalculatedGaps];
              setGaps(updatedGaps);
              
              console.log(`✅ Recalculated and saved ${recalculatedGaps.length} gaps for ${task.dueDate}`);
            }
          } catch (gapError) {
            console.warn('⚠️ Failed to recalculate gaps after task update:', gapError);
            // Don't fail the task update if gap recalculation fails
          }
        }

        console.log(`✅ Task updated: ${updatedTask.title}`);

        // If online, try to sync with server
        if (navigator.onLine) {
          try {
            console.log('🔄 Syncing task update with server...');
            await tasksAPIExtended.updateWithTimestamp(updatedTask.id, updatedTask);
            console.log('✅ Task synced with server');
          } catch (error) {
            console.warn('⚠️ Failed to sync task with server - will sync later:', error);
            // Don't show error to user since local update succeeded
          }
        } else {
          console.log('📱 Task updated locally (offline) - will sync when online');
        }
      }
    } catch (error) {
      console.error('❌ Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  // Enhanced task deletion handler with gap restoration
  const handleTaskDeleted = async (taskId: string) => {
    try {
      if (localFirstService) {
        console.log(`🗑️ Deleting task: ${taskId}`);
        
        // Find the task before deleting to get its date
        const taskToDelete = globalTasks.find(task => task.id === taskId);
        const taskDate = taskToDelete?.dueDate;
        
        // Delete the task
        const deleted = await localFirstService.deleteTask(taskId);
        
        if (deleted) {
          // Get remaining tasks and update local state
          const tasks = await localFirstService.getTasks();
          setGlobalTasks(tasks);
          console.log(`✅ Task deleted: ${taskId}`);
          
          // Restore gaps for the task's date if it was within the rolling window
          if (taskDate && session?.access_token) {
            try {
              console.log(`🔄 Restoring gaps after task deletion for ${taskDate}`);
              const restoredGaps = await GapsAPI.restoreGapsAfterTaskDeletion(
                taskDate,
                tasks,
                preferences,
                session.access_token
              );
              
              if (restoredGaps.length > 0) {
                // Update gaps state with restored gaps
                const currentGaps = gaps.filter(gap => gap.date !== taskDate);
                const updatedGaps = [...currentGaps, ...restoredGaps];
                setGaps(updatedGaps);
                console.log(`✅ Restored ${restoredGaps.length} gaps for ${taskDate}`);
              }
            } catch (error) {
              console.warn('⚠️ Failed to restore gaps after task deletion:', error);
              // Don't show error to user since task deletion succeeded
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  // Determine if floating timer should be visible
  const runningTimerTask = globalTasks.find(task => task.isTimerRunning);
  const shouldShowFloatingTimer = !!runningTimerTask && activeTab !== 'activities';

  // Define renderContent function before using it
  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeContent 
            globalTasks={globalTasks}
            gaps={gaps}
            userName={profile?.first_name || ''}
            userPreferences={preferences}
            onOpenTask={(task) => {
              setTimerTask(task);
              setIsTimerModalOpen(true);
            }}
            onTaskCreated={handleTaskCreated}
          />
        );
      case 'activities':
        return (
          <ActivitiesContent 
            globalTasks={globalTasks}
            setGlobalTasks={setGlobalTasks}
            onTimerOpen={(task) => {
              setTimerTask(task);
              setIsTimerModalOpen(true);
            }}
            onTimerUpdate={handleGlobalTimerUpdate}
            onTabChange={setCurrentActivitiesTab}
            editingTask={editingTask}
            setEditingTask={setEditingTask}
            isNewTaskModalOpen={isNewTaskModalOpen}
            setIsNewTaskModalOpen={setIsNewTaskModalOpen}
            localFirstService={localFirstService}
          />
        );
      case 'planner':
        return (
          <PlannerContent 
            globalTasks={globalTasks}
            gaps={gaps}
            onTaskOpen={(task) => {
              setTimerTask(task);
              setIsTimerModalOpen(true);
            }}
            onTaskEdit={(task) => {
              setEditingTask(task);
            }}
            onGapUtilize={(gap) => {
              setSelectedGap(gap);
              setIsGapModalOpen(true);
            }}
            userPreferences={preferences}
            session={session}
            storageManager={localFirstService}
          />
        );
      case 'settings':
        return (
          <div className="space-y-6">
            <SettingsContent 
              user={user}
              session={session}
              preferences={preferences}
              onSignOut={handleSignOut}
              onPreferencesUpdate={updatePreferencesFromSettings}
              localFirstService={localFirstService}
            />
          </div>
        );
      case 'calendar-dev':
        return <CalendarDevScreen />;
      default:
        return (
          <HomeContent 
            globalTasks={globalTasks}
            gaps={gaps}
            userName={profile?.first_name || ''}
            userPreferences={preferences}
            onOpenTask={(task) => {
              setTimerTask(task);
              setIsTimerModalOpen(true);
            }}
            onTaskCreated={handleTaskCreated}
          />
        );
    }
  };

  // Show loading screen while checking authentication (only if app is not initialized)
  if (isLoading && !isAppInitialized) {
    return <LoadingScreen />;
  }

  // Show loading screen if authenticated but data is still loading (only if app is not initialized)
  if (isAuthenticated && isDataLoading && !isAppInitialized) {
    return <LoadingScreen isDataLoading={true} userName={profile?.first_name} />;
  }

  // Show authentication screens if not authenticated
  if (!isAuthenticated) {
    if (showSignUp) {
      return (
        <SignUpScreen 
          onAuthSuccess={handleAuthSuccess}
          onToggleAuth={() => setShowSignUp(false)}
        />
      );
    } else {
      return (
        <LoginScreen 
          onAuthSuccess={handleAuthSuccess}
          onToggleAuth={() => setShowSignUp(true)}
        />
      );
    }
  }

  // If in widget mode, render the widget view
  if (isAuthenticated && !isDataLoading && isWidgetMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white flex items-center justify-center">
        <WidgetView 
          tasks={globalTasks}
          gaps={gaps}
          userName={profile?.first_name || ''}
        />
      </div>
    );
  }

  // If app is initialized and authenticated, show main content even if data is still loading
  if (isAuthenticated && isAppInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white relative overflow-hidden">
        {/* Mobile optimizations */}
        <MobileOptimizations />
        
        {/* Toast notifications */}
        <Toaster 
          position="bottom-center"
          toastOptions={{
            duration: 4000,
          }}
          expand={false}
          richColors={false}
          closeButton={false}
          offset="100px"
        />
        
        {/* Background blur elements */}
        <div className="absolute top-10 left-5 w-20 h-20 bg-pink-400/30 rounded-full blur-xl"></div>
        <div className="absolute top-32 right-8 w-16 h-16 bg-purple-400/20 rounded-full blur-lg"></div>
        <div className="absolute bottom-40 left-8 w-24 h-24 bg-orange-400/20 rounded-full blur-xl"></div>
        
        {/* Floating Timer - Show everywhere except My Activities tab */}
        <div className="safe-area-right safe-area-bottom">
          <FloatingTimer
            task={runningTimerTask || null}
            isVisible={shouldShowFloatingTimer}
            onTimerUpdate={handleGlobalTimerUpdate}
            onExpand={handleFloatingTimerExpand}
          />
        </div>
        
        {/* Main content - with padding for fixed navigation and enhanced mobile scrolling */}
        <div 
          className={`relative z-10 overflow-y-auto safe-area-top scroll-smooth ios-scroll android-scroll no-bounce ${(isGapModalOpen || isExternalGapModalOpen) ? 'pb-4' : 'pb-20'}`}
          style={{ height: 'calc(100vh - 80px)' }}
          data-scrollable="true"
        >
          <ErrorBoundary>
            {renderContent()}
          </ErrorBoundary>
        </div>

        {/* Offline Indicator */}
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-30 bg-yellow-600/90 backdrop-blur-sm">
            <div className="flex items-center justify-center py-1 px-4 text-sm text-white safe-area-left safe-area-right safe-area-top">
              <span>Working Offline</span>
            </div>
          </div>
        )}

        {/* Fixed Bottom Navigation */}
        <div className={`fixed bottom-0 left-0 right-0 z-20 bg-slate-900/60 backdrop-blur-md border-t border-slate-700/50 safe-area-bottom transition-opacity ${(isGapModalOpen || isExternalGapModalOpen) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          <div className="flex justify-around items-center py-4 px-6 safe-area-left safe-area-right">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
                activeTab === 'home' ? 'text-white' : 'text-slate-400'
              }`}
              type="button"
            >
              <HomeIcon className="w-6 h-6" />
              <span className="text-xs">Home</span>
            </button>
            
            <button
              onClick={() => setActiveTab('activities')}
              className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
                activeTab === 'activities' ? 'text-white' : 'text-slate-400'
              }`}
              type="button"
            >
              <Activity className="w-6 h-6" />
              <span className="text-xs">Activities</span>
            </button>
            
            <button
              onClick={() => setActiveTab('planner')}
              className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
                activeTab === 'planner' ? 'text-white' : 'text-slate-400'
              }`}
              type="button"
            >
              <Calendar className="w-6 h-6" />
              <span className="text-xs">Planner</span>
            </button>
            
            <button
              onClick={() => setActiveTab('calendar-dev')}
              className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
                activeTab === 'calendar-dev' ? 'text-white' : 'text-slate-400'
              }`}
              type="button"
            >
              <Calendar className="w-6 h-6" />
              <span className="text-xs">Dev</span>
            </button>
            
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
                activeTab === 'settings' ? 'text-white' : 'text-slate-400'
              }`}
              type="button"
            >
              <Settings className="w-6 h-6" />
              <span className="text-xs">Settings</span>
            </button>
          </div>
        </div>

        {/* Timer Modal */}
      <TimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        task={timerTask}
        onTimerUpdate={handleGlobalTimerUpdate}
      />

        {/* Edit Task Modal (global) */}
        <EditTaskModal
          task={editingTask}
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(updatedTask) => {
            const updated = globalTasks.map(t => t.id === updatedTask.id ? { ...updatedTask, updated_at: new Date().toISOString() } : t);
            setGlobalTasks(updated);
            // best-effort: persist via existing debounced saver
            try { (async () => { await tasksAPIExtended.updateWithTimestamp(updatedTask.id, updatedTask); })(); } catch {}
            setEditingTask(null);
          }}
        />

      {/* Gap Utilization Modal */}
      <GapUtilizationModal
        isOpen={isGapModalOpen}
        onClose={() => {
          setIsGapModalOpen(false);
          setSelectedGap(null);
        }}
        gap={selectedGap}
        existingTasks={globalTasks}
        onTaskCreated={handleTaskCreated}
        userPreferences={preferences}
      />
    </div>
  );
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white relative overflow-hidden">
      {/* Mobile optimizations */}
      <MobileOptimizations />
      
      {/* Toast notifications */}
      <Toaster 
        position="bottom-center"
        toastOptions={{
          duration: 4000,
        }}
        expand={false}
        richColors={false}
        closeButton={false}
        offset="100px"
      />
      
      {/* Background blur elements */}
      <div className="absolute top-10 left-5 w-20 h-20 bg-pink-400/30 rounded-full blur-xl"></div>
      <div className="absolute top-32 right-8 w-16 h-16 bg-purple-400/20 rounded-full blur-lg"></div>
      <div className="absolute bottom-40 left-8 w-24 h-24 bg-orange-400/20 rounded-full blur-xl"></div>
      
      {/* Floating Timer - Show everywhere except My Activities tab */}
      <div className="safe-area-right safe-area-bottom">
        <FloatingTimer
          task={runningTimerTask || null}
          isVisible={shouldShowFloatingTimer}
          onTimerUpdate={handleGlobalTimerUpdate}
          onExpand={handleFloatingTimerExpand}
        />
      </div>
      
      {/* Main content - with padding for fixed navigation and enhanced mobile scrolling */}
      <div 
        className={`relative z-10 overflow-y-auto safe-area-top scroll-smooth ios-scroll android-scroll no-bounce ${(isGapModalOpen || isExternalGapModalOpen) ? 'pb-4' : 'pb-20'}`}
        style={{ height: 'calc(100vh - 80px)' }}
        data-scrollable="true"
      >
        <ErrorBoundary>
          {renderContent()}
        </ErrorBoundary>
      </div>

      {/* Offline Indicator */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-yellow-600/90 backdrop-blur-sm">
          <div className="flex items-center justify-center py-1 px-4 text-sm text-white safe-area-left safe-area-right safe-area-top">
            <span>Working Offline</span>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 z-20 bg-slate-900/60 backdrop-blur-md border-t border-slate-700/50 safe-area-bottom transition-opacity ${(isGapModalOpen || isExternalGapModalOpen) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <div className="flex justify-around items-center py-4 px-6 safe-area-left safe-area-right">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
              activeTab === 'home' ? 'text-white' : 'text-slate-400'
            }`}
            type="button"
          >
            <HomeIcon className="w-6 h-6" />
            <span className="text-xs">Home</span>
          </button>
          
          <button
            onClick={() => setActiveTab('activities')}
            className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
              activeTab === 'activities' ? 'text-white' : 'text-slate-400'
            }`}
            type="button"
          >
            <Activity className="w-6 h-6" />
            <span className="text-xs">Activities</span>
          </button>
          
          <button
            onClick={() => setActiveTab('planner')}
            className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
              activeTab === 'planner' ? 'text-white' : 'text-slate-400'
            }`}
            type="button"
          >
            <Calendar className="w-6 h-6" />
            <span className="text-xs">Planner</span>
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 transition-colors min-h-[44px] min-w-[44px] p-2 rounded-lg ${
              activeTab === 'settings' ? 'text-white' : 'text-slate-400'
            }`}
            type="button"
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs">Settings</span>
          </button>
        </div>
      </div>

      {/* Timer Modal */}
      <TimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        task={timerTask}
        onTimerUpdate={handleGlobalTimerUpdate}
      />

      {/* Gap Utilization Modal */}
      <GapUtilizationModal
        isOpen={isGapModalOpen}
        onClose={() => {
          setIsGapModalOpen(false);
          setSelectedGap(null);
        }}
        gap={selectedGap}
        existingTasks={globalTasks}
        onTaskCreated={handleTaskCreated}
        userPreferences={preferences}
      />
    </div>
  );
}