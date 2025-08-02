import { useState, useEffect } from 'react';
import { preferencesAPI, tasksAPI, profileAPI } from './utils/api';
import { GapsAPI } from './utils/gapsAPI';
import { supabase } from './utils/supabase/client';
import { toast } from 'sonner';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { SignUpScreen } from './components/SignUpScreen';
import { HomeContent } from './components/HomeContent';
import { ActivitiesContent } from './components/ActivitiesContent';
import { SettingsContent } from './components/SettingsContent';
import { MobileOptimizations } from './components/MobileOptimizations';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
import { Home as HomeIcon, Activity, Settings } from 'lucide-react';
import { TimerModal } from "./components/TimerModal";
import { FloatingTimer } from "./components/FloatingTimer";
import { WidgetView } from './components/WidgetView';
import { Task, TimeGap, UserPreferences } from './types/index';
import { DEFAULT_PREFERENCES, DEFAULT_UNSAVED_CHANGES, DEFAULT_GAPS } from './utils/constants';
import { sanitizeTasks } from './utils/helpers';
import { debugDataSaving as _debugDataSaving } from './utils/debug';
import { debounce } from './utils/debounce';
import { EnhancedLocalFirstService } from './utils/localFirst/EnhancedLocalFirstService';
import { LoginSyncService } from './utils/localFirst/LoginSyncService';
import { OfflineFirstDebugPanel } from './components/OfflineFirstDebugPanel';
import { LoginSyncTest } from './components/LoginSyncTest';
import { logger, logNetworkStatus } from './utils/debug';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [gaps, setGaps] = useState<TimeGap[]>([]);
  
  // Authentication state
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [user, setUser] = useState<any>(null);
  
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

  // Local-first service
  const [localFirstService, setLocalFirstService] = useState<EnhancedLocalFirstService | null>(null);
  const [loginSyncService, setLoginSyncService] = useState<LoginSyncService | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncTime: Date | null;
    localDataCount: { tasks: number; gaps: number };
    unsyncedCount: { tasks: number; gaps: number };
  }>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    localDataCount: { tasks: 0, gaps: 0 },
    unsyncedCount: { tasks: 0, gaps: 0 }
  });

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
          setIsDataLoading(true); // Start data loading for existing session
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
        setIsLoading(false);
        setIsDataLoading(true); // Start data loading when user is authenticated
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
        setIsDataLoading(false);
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
        
        // Create login sync service for remote-to-local sync
        const loginService = new LoginSyncService(user.id);
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

        // Create enhanced local-first service for ongoing operations
        const enhancedService = new EnhancedLocalFirstService(user.id, {
          sync: {
            autoSync: false, // Disable auto sync for now, focus on pull-only
            syncInterval: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            backgroundSync: false
          }
        });

        await enhancedService.initialize();
        setLocalFirstService(enhancedService);
        setIsDataLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to initialize local-first system:', error);
        setIsDataLoading(false);
      }
    };

    initializeWithLoginSync();
  }, [isAuthenticated, user?.id]);

  // Load data from local database
  useEffect(() => {
    if (!loginSyncService) return;

    const loadLocalData = async () => {
      try {
        console.log('📱 Loading local data...');
        
        // Load tasks from local database
        const tasks = await loginSyncService.getTasks();
        setGlobalTasks(tasks);

        // Load gaps for today from local database
        const today = new Date().toISOString().split('T')[0];
        const gaps = await loginSyncService.getGaps(today);
        setGaps(gaps);

        // Load preferences from local database
        const prefs = await loginSyncService.getUserPreferences();
        if (prefs) {
          setPreferences(prefs);
        }

        // Update sync status
        const status = await loginSyncService.getSyncStatus();
        setSyncStatus({
          isOnline: status.isOnline,
          isSyncing: false,
          lastSyncTime: status.lastSyncTime,
          localDataCount: status.localDataCount,
          unsyncedCount: { tasks: 0, gaps: 0 } // No unsynced data in pull-only mode
        });

        console.log(`✅ Local data loaded: ${tasks.length} tasks, ${gaps.length} gaps`);
      } catch (error) {
        console.error('❌ Error loading local data:', error);
      }
    };

    loadLocalData();
  }, [loginSyncService]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network connection restored');
      logNetworkStatus(true);
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      console.log('🌐 Network connection lost');
      logNetworkStatus(false);
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load user preferences and profile data when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const loadUserData = async () => {
      // Add a small delay to ensure session is available for API calls
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
        
        const [prefsData, profileData] = await Promise.all([
          loadWithRetry(() => preferencesAPI.get(), 'preferences'),
          loadWithRetry(() => profileAPI.get(), 'profile')
        ]);
        
        if (prefsData) {
          setPreferences(prefsData);
        }
        
        if (profileData) {
          setProfile(profileData);
        } else {
          // Extract profile data from user metadata as fallback
          const userMetadata = user.user_metadata || {};
          const fallbackProfile = {
            id: user.id,
            first_name: userMetadata.firstName || userMetadata.first_name || '',
            last_name: userMetadata.lastName || userMetadata.last_name || '',
            email: user.email || '',
            phone_country_code: userMetadata.phone_country_code || '+1',
            phone_number: userMetadata.phone_number || '',
            timezone: userMetadata.timezone || 'America/New_York',
            avatar_url: userMetadata.avatar_url || null
          };
          setProfile(fallbackProfile);
        }
      } catch (error) {
        console.error('Critical error loading user data:', error);
        // Don't show error toast on first load, as it might be expected
        console.log('User data will load with defaults, retrying in background...');
      }
    };

    loadUserData();
  }, [isAuthenticated, user?.id]);

  // Refresh preferences when returning to settings tab (in case they were updated)
  useEffect(() => {
    if (activeTab === 'settings' && isAuthenticated && user?.id) {
      const refreshPreferences = async () => {
        try {
          console.log('Refreshing preferences for user:', user.id);
          
          const [prefsData, profileData] = await Promise.all([
            preferencesAPI.get().catch(err => {
              console.error('Error refreshing preferences:', err);
              return null;
            }),
            profileAPI.get().catch(err => {
              console.error('Error refreshing profile:', err);
              return null;
            })
          ]);
          
          if (prefsData) {
            setPreferences(prefsData);
          }
        } catch (error) {
          console.error('Critical error refreshing user data:', error);
        }
      };

      refreshPreferences();
    }
  }, [activeTab, isAuthenticated, user?.id]);

  // Load app data from database when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    
    const loadAppData = async () => {
      // Add a small delay to ensure session is available for API calls
      await new Promise(resolve => setTimeout(resolve, 200));
      
      try {
        console.log('Loading app data for user:', user.id);
        
        // Debug diagnosis is available in DebugPanel - not run automatically
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Debug tools available in settings panel');
        }
        
        const loadWithRetry = async (apiCall: () => Promise<any>, name: string, defaultValue: any) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await apiCall();
              console.log(`Loaded ${name} on attempt ${attempt + 1}:`, result);
              return result;
            } catch (error) {
              console.error(`Error loading ${name} (attempt ${attempt + 1}):`, error);
              if (attempt === 2) return defaultValue; // Last attempt failed, use default
              await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
            }
          }
        };
        
        // Load tasks with retry logic
        const tasksData = await loadWithRetry(() => tasksAPI.get(), 'tasks', []);
        if (tasksData && Array.isArray(tasksData)) {
          setGlobalTasks(sanitizeTasks(tasksData));
        } else {
          console.log('No tasks found for user, initializing with empty array');
          setGlobalTasks([]);
        }

        // Initialize gaps using the new gap logic  
        try {
          const { data: { session: initialSession } } = await supabase.auth.getSession();
          let currentSession = initialSession;
          
          if (currentSession?.access_token && currentSession?.user) {
            console.log('🔄 Initializing gaps with gap logic...');
            console.log('Session details:', { 
              user_id: currentSession.user.id,
              access_token_length: currentSession.access_token.length,
              expires_at: currentSession.expires_at,
              user_email: currentSession.user.email
            });
            
            // Verify the token is not expired
            const now = new Date();
            const expiresAt = currentSession.expires_at ? new Date(currentSession.expires_at * 1000) : null;
            
            if (expiresAt && now >= expiresAt) {
              console.warn('⚠️ Access token has expired, refreshing session...');
              const { data: { session: newSession } } = await supabase.auth.refreshSession();
              if (newSession?.access_token) {
                console.log('✅ Session refreshed successfully');
                currentSession = newSession;
              } else {
                throw new Error('Failed to refresh expired session');
              }
            }
            
            try {
              // Validate preferences before making API call
              const validPreferences = {
                ...DEFAULT_PREFERENCES,
                ...preferences
              };
              
              console.log('📋 Using preferences for gap initialization:', {
                calendar_work_start: validPreferences.calendar_work_start,
                calendar_work_end: validPreferences.calendar_work_end,
                calendar_working_days: validPreferences.calendar_working_days,
                google_calendar_connected: validPreferences.google_calendar_connected
              });
              
              const todayGaps = await GapsAPI.ensureTodayGaps(validPreferences, currentSession.access_token);
              setGaps(todayGaps);
              console.log(`✅ Initialized ${todayGaps.length} gaps for today`);
            } catch (gapError) {
              console.log('🔄 Gap initialization handled by API fallback system');
              
              // Create local default gaps as ultimate fallback
              try {
                const { GapLogic } = await import('./utils/gapLogic');
                const today = new Date().toISOString().split('T')[0];
                const fallbackGaps = GapLogic.createDefaultGaps(today, preferences, currentSession.user.id);
                setGaps(fallbackGaps);
                console.log(`✅ Created ${fallbackGaps.length} local fallback gaps`);
              } catch (fallbackError) {
                console.log('Using default empty gaps as final fallback');
                setGaps(DEFAULT_GAPS);
              }
            }
          } else {
            console.log('⚠️ No valid session or access token for gap initialization, using defaults');
            console.log('Session state:', {
              hasSession: !!currentSession,
              hasAccessToken: !!currentSession?.access_token,
              hasUser: !!currentSession?.user
            });
            setGaps(DEFAULT_GAPS);
          }
        } catch (error) {
          console.error('❌ Error in gap initialization flow:', error);
          setGaps(DEFAULT_GAPS);
        }
        
        // Data loading complete
        setIsDataLoading(false);
      } catch (error) {
        console.error('Critical error loading app data:', error);
        // Initialize with default data if everything fails
        setGlobalTasks([]);
        setGaps(DEFAULT_GAPS);
        console.log('App data loaded with defaults due to errors');
        // Complete data loading even if there were errors
        setIsDataLoading(false);
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
          setIsDataLoading(true); // Start data loading
        } else {
          console.error('Still no session after retry');
        }
      }
    } catch (error) {
      console.error('Error verifying session after auth success:', error);
    }
  };

  // Debug panel handlers
  const handleRefreshSyncStatus = async () => {
    if (loginSyncService) {
      const status = await loginSyncService.getSyncStatus();
      setSyncStatus({
        isOnline: status.isOnline,
        isSyncing: false,
        lastSyncTime: status.lastSyncTime,
        localDataCount: status.localDataCount,
        unsyncedCount: { tasks: 0, gaps: 0 }
      });
    }
  };

  const handleForceSync = async () => {
    if (loginSyncService) {
      try {
        // For pull-only mode, we can re-run the login sync
        const syncResult = await loginSyncService.initializeAndSync();
        if (syncResult.success) {
          toast.success(`Manual sync completed: ${syncResult.tasksSynced} tasks, ${syncResult.gapsSynced} gaps synced`);
        } else {
          toast.warning('Manual sync completed with warnings');
        }
        
        // Refresh the data
        const tasks = await loginSyncService.getTasks();
        const gaps = await loginSyncService.getGaps();
        setGlobalTasks(tasks);
        setGaps(gaps);
        
        // Update sync status
        await handleRefreshSyncStatus();
      } catch (error) {
        console.error('Manual sync failed:', error);
        toast.error('Manual sync failed');
      }
    }
  };

  const handleClearLocalData = async () => {
    if (loginSyncService) {
      try {
        await loginSyncService.cleanup();
        setGlobalTasks([]);
        setGaps([]);
        setSyncStatus(prev => ({
          ...prev,
          localDataCount: { tasks: 0, gaps: 0 },
          unsyncedCount: { tasks: 0, gaps: 0 }
        }));
        toast.success('Local data cleared');
      } catch (error) {
        console.error('Failed to clear local data:', error);
        toast.error('Failed to clear local data');
      }
    }
  };

  const handleExportLogs = () => {
    const logData = logger.exportLogs();
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offline-first-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported successfully');
  };

  // Enhanced sign out handler
  const handleSignOut = async () => {
    try {
      // Clean up services
      if (localFirstService) {
        await localFirstService.cleanup();
      }
      if (loginSyncService) {
        await loginSyncService.cleanup();
      }

      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
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
      setSyncStatus({
        isOnline: navigator.onLine,
        isSyncing: false,
        lastSyncTime: null,
        localDataCount: { tasks: 0, gaps: 0 },
        unsyncedCount: { tasks: 0, gaps: 0 }
      });

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
      
      await preferencesAPI.save(preferences);
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

  // Show loading screen while checking authentication
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Show data loading screen when authenticated but data is still loading
  if (isAuthenticated && isDataLoading) {
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white flex items-center justify-center p-4">
        <div 
          className="cursor-pointer transition-transform hover:scale-105"
          onClick={() => {
            // Remove widget parameter to open full app
            const url = new URL(window.location.href);
            url.searchParams.delete('widget');
            window.location.href = url.toString();
          }}
        >
          <WidgetView 
            tasks={globalTasks} 
            gaps={gaps} 
            userName={profile?.first_name} 
          />
        </div>
      </div>
    );
  }

  // Find any currently running timer
  const runningTimerTask = globalTasks.find(task => task.isTimerRunning);

  // Check if MinimizedTimerOnTask is visible (only on Activities > My Activities tab)
  const _isMinimizedTimerVisible = activeTab === 'activities' && currentActivitiesTab === 'my-activities' && runningTimerTask;
  
  // FloatingTimer should show everywhere except My Activities tab
  const shouldShowFloatingTimer = !!runningTimerTask && !(activeTab === 'activities' && currentActivitiesTab === 'my-activities');

  // Debounce timer updates to avoid excessive database calls
  const debouncedSaveTasks = debounce(async (tasks: Task[]) => {
    try {
      if (isAuthenticated && user?.id) {
        console.log('Saving updated tasks for user:', user.id);
        await tasksAPI.save(tasks);
      } else {
        console.warn('Cannot save tasks: user not authenticated');
      }
    } catch (error) {
      console.error('Error saving tasks for user:', user?.id, error);
      toast.error('Failed to save timer progress');
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
        
        // Update sync status
        const status = await localFirstService.getEnhancedSyncStatus();
        setSyncStatus(status);
      }

      // Debounced save to prevent excessive API calls
      debouncedSaveTasks(globalTasks);
    } catch (error) {
      console.error('❌ Error updating timer:', error);
      toast.error('Failed to save timer progress');
    }
  };

  const handleFloatingTimerExpand = () => {
    if (runningTimerTask) {
      setTimerTask(runningTimerTask);
      setIsTimerModalOpen(true);
    }
  };

  // Enhanced task creation handler
  const handleTaskCreated = async (task: Task) => {
    try {
      if (localFirstService) {
        console.log(`📝 Creating task: ${task.title}`);
        
        const createdTask = await localFirstService.createTask(task);
        
        // Refresh tasks
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        // Update sync status
        const status = await localFirstService.getEnhancedSyncStatus();
        setSyncStatus(status);

        console.log(`✅ Task created: ${createdTask.title}`);
        
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

  // Enhanced task update handler
  const handleTaskUpdated = async (task: Task) => {
    try {
      if (localFirstService) {
        console.log(`📝 Updating task: ${task.title}`);
        
        await localFirstService.updateTask(task.id, task);
        
        // Refresh tasks
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        // Update sync status
        const status = await localFirstService.getEnhancedSyncStatus();
        setSyncStatus(status);

        console.log(`✅ Task updated: ${task.title}`);
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
        
        await localFirstService.deleteTask(taskId);
        
        // Refresh tasks
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

        // Update sync status
        const status = await localFirstService.getEnhancedSyncStatus();
        setSyncStatus(status);

        console.log(`✅ Task deleted: ${taskId}`);
      }
    } catch (error) {
      console.error('❌ Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

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
          />
        );
      case 'settings':
        return (
          <div className="space-y-6">
            <SettingsContent 
              user={user}
              preferences={preferences}
              onSignOut={handleSignOut}
              onPreferencesUpdate={updatePreferencesFromSettings}
            />
            
            {/* Offline-First Debug Panel */}
            <OfflineFirstDebugPanel
              syncStatus={syncStatus}
              onRefreshStatus={handleRefreshSyncStatus}
              onForceSync={handleForceSync}
              onClearLocalData={handleClearLocalData}
              onExportLogs={handleExportLogs}
            />
            
            {/* Login Sync Test */}
            {user?.id && (
              <LoginSyncTest userId={user.id} />
            )}
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

      {/* Global Timer Modal */}
      <TimerModal
        task={timerTask}
        isOpen={isTimerModalOpen}
        onClose={() => {
          setIsTimerModalOpen(false);
          setTimerTask(null);
        }}
        onTimerUpdate={handleGlobalTimerUpdate}
      />
    </div>
  );
}