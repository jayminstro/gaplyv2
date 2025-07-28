import { useState, useEffect } from 'react';
import { preferencesAPI, tasksAPI, profileAPI } from './utils/api';
import { GapsAPI } from './utils/gapsAPI';
import { supabase } from './utils/supabase/client';
import { toast } from 'sonner@2.0.3';
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
import { debugDataSaving } from './utils/debug';
import { debounce } from './utils/debounce';

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

  const [editingProfile, setEditingProfile] = useState(false);

  // Track unsaved changes per section
  const [unsavedChanges, setUnsavedChanges] = useState(DEFAULT_UNSAVED_CHANGES);

  // Activities state - moved here to avoid conditional hook calls
  const [currentActivitiesTab, setCurrentActivitiesTab] = useState('discover');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // Widget mode detection
  const [isWidgetMode, setIsWidgetMode] = useState(false);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            console.log('🔄 Initializing gaps with gap logic...');
            try {
              const todayGaps = await GapsAPI.ensureTodayGaps(preferences, session.access_token);
              setGaps(todayGaps);
              console.log(`✅ Initialized ${todayGaps.length} gaps for today`);
            } catch (gapError) {
              console.error('Gap initialization failed, using defaults:', gapError);
              setGaps(DEFAULT_GAPS);
            }
          } else {
            console.log('No session for gap initialization, using defaults');
            setGaps(DEFAULT_GAPS);
          }
        } catch (error) {
          console.error('Error in gap initialization flow:', error);
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setGlobalTasks([]);
      setGaps([]);
      // Reset settings state
      setPreferences(DEFAULT_PREFERENCES);
      setProfile(null);
      setEditingProfile(false);
      setUnsavedChanges(DEFAULT_UNSAVED_CHANGES);
      // Reset activities state
      setCurrentActivitiesTab('discover');
      setEditingTask(null);
      setIsNewTaskModalOpen(false);
      // Reset data loading state
      setIsDataLoading(false);
      
      // Show success toast
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Sign out failed');
    }
  };

  // Settings helper functions
  const updatePreference = (key: string, value: any, section: string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setUnsavedChanges(prev => ({ ...prev, [section]: true }));
  };

  const saveSection = async (section: string) => {
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
  const isMinimizedTimerVisible = activeTab === 'activities' && currentActivitiesTab === 'my-activities' && runningTimerTask;
  
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

  const handleGlobalTimerUpdate = async (task: Task, isRunning: boolean, remaining: number, total?: number) => {
    const updatedTasks = globalTasks.map(t => 
      t.id === task.id 
        ? { 
            ...t, 
            isTimerRunning: isRunning, 
            timerRemaining: remaining,
            ...(total && { timerTotal: total })
          }
        : t
    );
    setGlobalTasks(updatedTasks);

    // Use debounced save to avoid excessive database calls during timer updates
    debouncedSaveTasks(updatedTasks);
  };

  const handleFloatingTimerExpand = () => {
    if (runningTimerTask) {
      setTimerTask(runningTimerTask);
      setIsTimerModalOpen(true);
    }
  };

  const handleTaskCreated = async (newTask: Task) => {
    // Update the global tasks list
    const updatedTasks = [...globalTasks, newTask];
    setGlobalTasks(updatedTasks);
    
    // Save to database
    try {
      if (isAuthenticated && user?.id) {
        console.log('Saving new task for user:', user.id);
        await tasksAPI.save(updatedTasks);
        
        // Refresh gaps data if this task was scheduled (gap was split)
        if (newTask.scheduledGapId || newTask.status === 'scheduled') {
          console.log('Task was scheduled, refreshing gaps...');
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            try {
              const todayGaps = await GapsAPI.getGapsForDate(
                new Date().toISOString().split('T')[0], 
                session.access_token
              );
              setGaps(todayGaps);
              console.log('✅ Gaps refreshed after task scheduling');
            } catch (gapError) {
              console.error('Error refreshing gaps after task creation:', gapError);
            }
          }
        }
      } else {
        console.warn('Cannot save task: user not authenticated');
      }
    } catch (error) {
      console.error('Error saving new task for user:', user?.id, error);
      toast.error('Failed to save task');
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
          <SettingsContent 
            user={user}
            preferences={preferences}
            onSignOut={handleSignOut}
            onPreferencesUpdate={updatePreferencesFromSettings}
          />
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