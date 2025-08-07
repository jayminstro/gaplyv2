import { supabaseConfig } from './supabase/config';
import { supabase } from './supabase/client';

const API_BASE = `https://${supabaseConfig.projectId}.supabase.co/functions/v1/make-server-966d4846`;

async function apiRequest(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  const maxRetries = 2;
  const maxSessionRetries = 1; // Limit session retries to prevent infinite loops
  const isLocalDevelopment = false; // Temporarily disabled to sync with production
  
  try {
    // In development mode, provide immediate feedback about API unavailability
    if (isLocalDevelopment) {
      console.log(`🔧 Development mode - API endpoint ${endpoint} may not be available`);
    }

    // Get the current session for authenticated requests
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error(`Authentication session error: ${sessionError.message}`);
    }
    
    if (!session?.access_token) {
      // If no session on first try, wait a bit and retry (but limit retries)
      if (retryCount < maxSessionRetries) {
        console.log(`No session found, retrying in ${(retryCount + 1) * 1000}ms... (attempt ${retryCount + 1}/${maxSessionRetries})`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return apiRequest(endpoint, options, retryCount + 1);
      }
      console.error('No access token available for authenticated request after retries');
      throw new Error('User not authenticated - please sign in again');
    }

    console.log(`Making API request to ${endpoint}`);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.log(`API request to ${endpoint} failed: ${response.status} ${response.statusText}`);
      
      // Handle 404 errors specifically for local development
      if (response.status === 404) {
        if (isLocalDevelopment) {
          console.log(`🔧 API endpoint ${endpoint} not found - this is expected in local development`);
        }
        throw new Error(`API endpoint not found: ${endpoint}`);
      }
      
      // If 401 and we haven't retried too many times, try refreshing session
      if (response.status === 401 && retryCount < maxRetries) {
        console.log(`Got 401, trying to refresh session and retry... (attempt ${retryCount + 1}/${maxRetries})`);
        
        try {
          // Small delay before retry to avoid rapid-fire requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Force a session refresh by getting a fresh session
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.getSession();
          
          if (refreshedSession?.access_token && !refreshError) {
            console.log('Session refreshed successfully, retrying request...');
            return apiRequest(endpoint, options, retryCount + 1);
          } else {
            console.error('Failed to refresh session:', refreshError);
          }
        } catch (refreshError) {
          console.error('Error during session refresh:', refreshError);
        }
      }
      
      if (response.status === 401) {
        throw new Error('Authentication failed - please sign in again');
      }
      
      if (response.status >= 500) {
        throw new Error(`Server error (${response.status}) - please try again later`);
      }
      
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ API request to ${endpoint} successful`);
    return data;
  } catch (error) {
    // Better error logging for development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (isLocalDevelopment) {
      console.log(`🔧 API request to ${endpoint} failed (expected in local development): ${errorMessage}`);
    } else {
      console.error(`API request to ${endpoint} failed:`, error);
    }
    throw error;
  }
}

// User Preferences API
export const preferencesAPI = {
  get: () => apiRequest('/preferences'),
  save: (preferences: any) => apiRequest('/preferences', {
    method: 'POST',
    body: JSON.stringify(preferences),
  }),
};

// Tasks API
export const tasksAPI = {
  get: () => apiRequest('/tasks'),
  save: (tasks: any[]) => apiRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify(tasks),
  }),
};

// Calendar Gaps API
export const gapsAPI = {
  get: () => apiRequest('/gaps'),
  save: (gaps: any[]) => apiRequest('/gaps', {
    method: 'POST',
    body: JSON.stringify(gaps),
  }),
};

// Time Gaps API (for scheduling activities into available gaps)
export const timeGapsAPI = {
  get: () => apiRequest('/time-gaps'),
  schedule: (gapId: string, scheduling: any) => apiRequest(`/time-gaps/${gapId}/schedule`, {
    method: 'POST',
    body: JSON.stringify(scheduling),
  }),
  unschedule: (gapId: string) => apiRequest(`/time-gaps/${gapId}/unschedule`, {
    method: 'POST',
  }),
};

// Profile API
export const profileAPI = {
  get: () => apiRequest('/profile'),
  save: (profile: any) => apiRequest('/profile', {
    method: 'POST',
    body: JSON.stringify(profile),
  }),
};

// Suggestions API
export const suggestionsAPI = {
  get: () => apiRequest('/suggestions'),
};

// Explore/Activities API (for discover tab and activity suggestions)
export const exploreAPI = {
  get: async () => {
    try {
      // For now, return mock activity suggestions
      // In a full implementation, this would fetch from a backend service
      const mockActivities = [
        {
          id: 'quick-exercise',
          title: 'Quick Exercise',
          category: 'Health',
          duration: 15,
          color: 'bg-red-500/20',
          icon: 'Activity',
          rating: 4.5
        },
        {
          id: 'meditation',
          title: 'Meditation',
          category: 'Health',
          duration: 10,
          color: 'bg-purple-500/20',
          icon: 'Heart',
          rating: 4.8
        },
        {
          id: 'reading',
          title: 'Read a Book',
          category: 'Learning',
          duration: 20,
          color: 'bg-green-500/20',
          icon: 'BookOpen',
          rating: 4.2
        },
        {
          id: 'planning',
          title: 'Plan Tomorrow',
          category: 'Work',
          duration: 15,
          color: 'bg-blue-500/20',
          icon: 'Calendar',
          rating: 4.0
        },
        {
          id: 'stretching',
          title: 'Stretching',
          category: 'Health',
          duration: 5,
          color: 'bg-orange-500/20',
          icon: 'Activity',
          rating: 4.3
        },
        {
          id: 'journaling',
          title: 'Journal Entry',
          category: 'Personal',
          duration: 10,
          color: 'bg-indigo-500/20',
          icon: 'PenTool',
          rating: 4.1
        },
        {
          id: 'quick-clean',
          title: 'Quick Clean',
          category: 'Chores',
          duration: 15,
          color: 'bg-yellow-500/20',
          icon: 'Home',
          rating: 3.8
        },
        {
          id: 'language-practice',
          title: 'Language Practice',
          category: 'Learning',
          duration: 20,
          color: 'bg-teal-500/20',
          icon: 'Globe',
          rating: 4.4
        }
      ];
      
      return mockActivities;
    } catch (error) {
      console.warn('Failed to load explore activities:', error);
      return [];
    }
  },
};

// Discover API (alias for explore, for backward compatibility)
export const discoverAPI = {
  get: () => apiRequest('/discover'),
};

// Stats API
export const statsAPI = {
  get: () => apiRequest('/stats'),
};

// Google Calendar API
export const calendarAPI = {
  getAuthUrl: () => apiRequest('/google-calendar/auth-url'),
  disconnect: () => apiRequest('/google-calendar/disconnect', { method: 'POST' }),
  sync: () => apiRequest('/google-calendar/sync', { method: 'POST' }),
  getStatus: async () => {
    try {
      // For now, return mock status
      // In a full implementation, this would check actual calendar connection
      return { connected: false };
    } catch (error) {
      console.warn('Failed to check calendar status:', error);
      return { connected: false };
    }
  },
  createEvent: async (eventData: {
    title: string;
    startDateTime: string;
    endDateTime: string;
    description?: string;
    location?: string;
  }) => {
    try {
      // For now, return mock success
      // In a full implementation, this would create actual calendar events
      console.log('📅 Mock calendar event created:', eventData);
      return {
        success: true,
        eventId: `mock-event-${Date.now()}`,
        event: eventData
      };
    } catch (error) {
      console.warn('Failed to create calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
};

// Scheduled Gaps API (for scheduling system)
export const scheduledGapsAPI = {
  get: () => apiRequest('/scheduled-gaps'),
  create: (scheduledGap: any) => apiRequest('/scheduled-gaps', {
    method: 'POST',
    body: JSON.stringify(scheduledGap),
  }),
  update: (id: string, updates: any) => apiRequest(`/scheduled-gaps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  delete: (id: string) => apiRequest(`/scheduled-gaps/${id}`, {
    method: 'DELETE',
  }),
};

// Activity Completions API
export const activityCompletionsAPI = {
  get: () => apiRequest('/activity-completions'),
  create: (completion: any) => apiRequest('/activity-completions', {
    method: 'POST',
    body: JSON.stringify(completion),
  }),
};

// Enhanced Tasks API with individual operations
export const tasksAPIExtended = {
  create: (task: any) => apiRequest('/tasks/create', {
    method: 'POST',
    body: JSON.stringify(task),
  }),
  update: (id: string, updates: any) => apiRequest(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  updateWithTimestamp: (id: string, task: any) => apiRequest(`/tasks/${id}/sync`, {
    method: 'PUT',
    body: JSON.stringify({
      ...task,
      updated_at: task.updated_at || new Date().toISOString()
    }),
  }),
  delete: (id: string) => apiRequest(`/tasks/${id}`, {
    method: 'DELETE',
  }),
};