import { useState, useEffect } from 'react';
import { preferencesAPI, tasksAPI, tasksAPIExtended, profileAPI } from './utils/api';
import { GapsAPI } from './utils/gapsAPI';
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
import { Toaster } from './components/ui/sonner';
import { Home as HomeIcon, Activity, Settings, Calendar } from 'lucide-react';
import { TimerModal } from "./components/TimerModal";
import { FloatingTimer } from "./components/FloatingTimer";
import { GapUtilizationModal } from "./components/GapUtilizationModal";
import { WidgetView } from './components/WidgetView';
import { Task, TimeGap, UserPreferences } from './types/index';
import { DEFAULT_PREFERENCES, DEFAULT_UNSAVED_CHANGES, DEFAULT_GAPS } from './utils/constants';
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

  const [_editingProfile, setEditingProfile] = useState(false);

  // Track unsaved changes per section
  const [_unsavedChanges, setUnsavedChanges] = useState(DEFAULT_UNSAVED_CHANGES);

  // Activities state - moved here to avoid conditional hook calls
  const [currentActivitiesTab, setCurrentActivitiesTab] = useState('discover');
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
  const [isAppVisible, setIsAppVisible] = useState(true);

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
          await tasksAPIExtended.update(localTask.id, localTask);
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
        
        // Load only today's tasks and gaps
        const today = new Date().toISOString().split('T')[0];
        const [allTasks, todayGaps] = await Promise.all([
          localFirstService.getTasks(),
          localFirstService.getGaps(today)
        ]);
        
        // Filter tasks for today
        const todayTasks = allTasks.filter(task => {
          const taskDate = task.dueDate?.split('T')[0];
          return taskDate === today;
        });
        
        console.log('📋 Today\'s tasks loaded:', todayTasks);
        console.log('📅 Today\'s gaps loaded:', todayGaps);
        
        setGlobalTasks(todayTasks);
        setGaps(todayGaps);
        setIsDataLoading(false);
      } catch (error) {
        console.error('❌ Error loading critical data:', error);
        setIsDataLoading(false);
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

          // Load preferences
          const prefs = await localFirstService.getPreferences();
          if (prefs) {
            console.log('⚙️ Preferences loaded from storage:', prefs);
            setPreferences(prefs);
          }
        });
      } catch (error) {
        console.error('⚠️ Error loading non-critical data:', error);
      }
    };

    // Execute critical loading immediately
    loadCriticalData();
    // Start background loading after critical data is loaded
    loadNonCriticalData();
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
          const prefsData = await loadWithRetry(() => preferencesAPI.get(), 'preferences');
          if (prefsData) {
            setPreferences(prefsData);
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

        // Load tasks and gaps with retry logic
        const [tasksData, gapsData] = await Promise.all([
          loadWithRetry(() => tasksAPI.get(), 'tasks', null),
          loadWithRetry(() => GapsAPI.getGapsForDate(new Date().toISOString().split('T')[0], ''), 'gaps', null)
        ]);

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
          const finalTasks = Array.from(mergedTasks.values());
          setGlobalTasks(finalTasks);
          
          // Save merged tasks back to local storage
          await localFirstService.saveTasks(finalTasks, true);
          
          console.log('✅ Tasks merged and updated');
        } else {
          console.log('📱 Keeping existing local tasks');
        }

        // Handle gaps with local-first pattern
        if (gapsData && Array.isArray(gapsData) && localFirstService) {
          // Save gaps to local storage first
          console.log('💾 Saving gaps to local storage...');
          for (const gap of gapsData) {
            await localFirstService.saveGaps([gap], gap.date || new Date().toISOString().split('T')[0]);
          }
          console.log('✅ Gaps saved to local storage');
          
          // Load gaps from local storage to ensure consistency
          const today = new Date().toISOString().split('T')[0];
          const localGaps = await localFirstService.getGaps(today);
          setGaps(localGaps);
          console.log('✅ Gaps loaded from local storage');
        } else {
          // Try to load from local storage if server data is not available
          if (localFirstService) {
            try {
              const today = new Date().toISOString().split('T')[0];
              const localGaps = await localFirstService.getGaps(today);
              setGaps(localGaps);
              console.log('📱 Using gaps from local storage');
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

    loadAppData();
  }, [isAuthenticated, user?.id]);

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
        await preferencesAPI.save(preferences);
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
        
        // Get all tasks and update local state
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        console.log(`✅ Task created: ${task.title}`);
        
        // Show offline indicator if offline
        if (!navigator.onLine) {
          toast.success('Task created (offline - will sync when online)');
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
        console.log(`✅ Task updated: ${updatedTask.title}`);

        // If online, try to sync with server
        if (navigator.onLine) {
          try {
            console.log('🔄 Syncing task update with server...');
            await tasksAPIExtended.update(updatedTask.id, updatedTask);
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

  // Enhanced task deletion handler
  const handleTaskDeleted = async (taskId: string) => {
    try {
      if (localFirstService) {
        console.log(`🗑️ Deleting task: ${taskId}`);
        
        // Delete the task
        const deleted = await localFirstService.deleteTask(taskId);
        
        if (deleted) {
          // Get remaining tasks and update local state
          const tasks = await localFirstService.getTasks();
          setGlobalTasks(tasks);
          console.log(`✅ Task deleted: ${taskId}`);
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
            onGapUtilize={(gap) => {
              setSelectedGap(gap);
              setIsGapModalOpen(true);
            }}
            userPreferences={preferences}
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
          className="relative z-10 overflow-y-auto pb-20 safe-area-top scroll-smooth ios-scroll android-scroll no-bounce" 
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
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/60 backdrop-blur-md border-t border-slate-700/50 safe-area-bottom">
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
        className="relative z-10 overflow-y-auto pb-20 safe-area-top scroll-smooth ios-scroll android-scroll no-bounce" 
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
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/60 backdrop-blur-md border-t border-slate-700/50 safe-area-bottom">
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