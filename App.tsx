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
import { SimpleLocalFirstService } from './utils/localFirst/SimpleLocalFirstService.ts';
import { LoginSyncService } from './utils/localFirst/LoginSyncService';
import { SimpleLoginSyncDebug } from './components/SimpleLoginSyncDebug';

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
  const [localFirstService, setLocalFirstService] = useState<SimpleLocalFirstService | null>(null);
  const [loginSyncService, setLoginSyncService] = useState<LoginSyncService | null>(null);

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

        // Create simple local-first service for ongoing operations
        const simpleService = new SimpleLocalFirstService(user.id);
        await simpleService.initialize();
        setLocalFirstService(simpleService);
        setIsDataLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to initialize local-first system:', error);
        setIsDataLoading(false);
      }
    };

    initializeWithLoginSync();
  }, [isAuthenticated, user?.id]);

  // Load data from local database using login sync service
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

        console.log(`✅ Local data loaded: ${tasks.length} tasks, ${gaps.length} gaps`);
        setIsDataLoading(false);
      } catch (error) {
        console.error('❌ Error loading local data:', error);
        setIsDataLoading(false);
      }
    };

    loadLocalData();
  }, [loginSyncService]);

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
        }
        
        console.log('✅ User data loaded successfully');
      } catch (error) {
        console.error('❌ Error loading user data:', error);
      }
    };

    loadUserData();
  }, [isAuthenticated, user?.id]);

  // Load app data (tasks, gaps) when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const loadAppData = async () => {
      try {
        console.log('Loading app data for user:', user.id);
        
        const loadWithRetry = async (apiCall: () => Promise<any>, name: string, defaultValue: any) => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await apiCall();
              console.log(`Loaded ${name} on attempt ${attempt + 1}:`, result);
              return result;
            } catch (error) {
              console.error(`Error loading ${name} (attempt ${attempt + 1}):`, error);
              if (attempt === 2) return defaultValue; // Last attempt failed, use default
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
        };

        // Load tasks and gaps with retry logic
        const [tasksData, gapsData] = await Promise.all([
          loadWithRetry(() => tasksAPI.get(), 'tasks', []),
          loadWithRetry(() => GapsAPI.getGapsForDate(new Date().toISOString().split('T')[0], ''), 'gaps', DEFAULT_GAPS)
        ]);

        if (tasksData) {
          const sanitizedTasks = sanitizeTasks(tasksData);
          setGlobalTasks(sanitizedTasks);
        }

        if (gapsData) {
          setGaps(gapsData);
        }

        console.log('✅ App data loaded successfully');
      } catch (error) {
        console.error('❌ Error loading app data:', error);
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
        
        const createdTask = await localFirstService.createTask(task);
        
        // Refresh tasks
        const tasks = await localFirstService.getTasks();
        setGlobalTasks(tasks);

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

        console.log(`✅ Task deleted: ${taskId}`);
      }
    } catch (error) {
      console.error('❌ Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  // Determine if floating timer should be visible
  const runningTimerTask = globalTasks.find(task => task.isTimerRunning);
  const shouldShowFloatingTimer = !!runningTimerTask && activeTab !== 'activities';

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
            
            {/* Login Sync Debug */}
            {user?.id && (
              <SimpleLoginSyncDebug userId={user.id} />
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

      {/* Timer Modal */}
      <TimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        task={timerTask}
        onTimerUpdate={handleGlobalTimerUpdate}
      />
    </div>
  );
}