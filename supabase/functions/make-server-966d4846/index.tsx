import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// UUID generation function
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Default data functions
const getDefaultPreferences = () => ({
  // Work Schedule & Calendar
  calendar_work_start: '09:00',
  calendar_work_end: '18:00',
  calendar_working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  calendar_buffer_time: 5,
  calendar_min_gap: 15,
  gap_sync_frequency: 30,
  
  // Timer & Activity Settings
  autostart: true,
  show_timer: true,
  default_energy_level: 'Medium',
  preferred_categories: ['Personal', 'Work', 'Health'],
  preferred_activity_durations: [5, 10, 15, 25, 30],
  activity_success_threshold: 80,
  
  // Notifications & Reminders
  daily_reminder: true,
  notification_activity_reminders: true,
  notification_upcoming_gaps: true,
  notification_lead_time: 5,
  dark_mode: true,
  sound_enabled: true,
  vibration_enabled: true,
  
  // Advanced Features
  learning_enabled: true,
  habit_tracking_enabled: true,
  manual_mode: false,
  demo_mode: false,
  onboarding_completed: true
});

// Helper functions for task data transformation
const formatDurationFromMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
};

// Helper function to calculate duration in minutes
const calculateDuration = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  return endTotalMinutes - startTotalMinutes;
};

const parseDurationToMinutes = (duration: string): number => {
  try {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length >= 2) {
      const [hours, minutes] = parts;
      return (hours * 60) + minutes;
    }
    return 0;
  } catch (error) {
    console.log('Error parsing duration:', duration, error);
    return 0;
  }
};

// Helper to combine date and time into timestamp
const combineDateAndTime = (dateStr: string | null, timeStr: string | null) => {
  if (!dateStr || !timeStr) return null;
  try {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const [hours, minutes] = timeStr.split(':').map(Number);
    date.setUTCHours(hours, minutes, 0, 0);
    return date.toISOString();
  } catch (error) {
    console.warn('Error combining date and time:', { dateStr, timeStr, error });
    return null;
  }
};

// Helper to split timestamp back into date and time components
const splitTimestamp = (timestamp: string | null) => {
  if (!timestamp) return { date: null, time: null };
  try {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().slice(0, 5);
    return { date: dateStr, time: timeStr };
  } catch (error) {
    console.warn('Error splitting timestamp:', { timestamp, error });
    return { date: null, time: null };
  }
};

const getDefaultIconColor = (category: string): string => {
  const colorMap = {
    'Personal': 'text-blue-400',
    'Work': 'text-purple-400',
    'Health': 'text-green-400',
    'Learning': 'text-yellow-400',
    'Creative': 'text-pink-400',
    'Social': 'text-orange-400'
  };
  return colorMap[category] || 'text-gray-400';
};

const getDefaultIcon = (category: string): string => {
  const iconMap = {
    'Personal': 'User',
    'Work': 'Briefcase',
    'Health': 'Heart',
    'Learning': 'BookOpen',
    'Creative': 'Palette',
    'Social': 'Users'
  };
  return iconMap[category] || 'Circle';
};

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Create Supabase client
const createSupabaseClient = () => createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
);

// Auth middleware for protected routes
const requireAuth = async (c: any, next: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Missing authorization header" }, 401);
    }

    const supabase = createSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    c.set('user', user);
    await next();
  } catch (error) {
    console.log('Auth middleware error:', error);
    return c.json({ error: "Authentication failed" }, 500);
  }
};

// PUBLIC ENDPOINTS (NO AUTH REQUIRED)
// Health check endpoint - MUST BE FIRST and NO AUTH
app.get("/make-server-966d4846/health", (c) => {
  console.log("Health check requested");
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Authentication endpoints
app.post("/make-server-966d4846/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, firstName, lastName } = body;

    if (!email || !password || !firstName || !lastName) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const supabase = createSupabaseClient();
    
    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        firstName, 
        lastName,
        name: `${firstName} ${lastName}`
      },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log("Signup error:", error);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in user metadata and create preferences
    if (data.user) {
      const supabase = createSupabaseClient();
      
      // Update user metadata with profile info (stored in auth.users table)
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        {
          user_metadata: {
            firstName,
            lastName,
            name: `${firstName} ${lastName}`,
            phone_country_code: '+1',
            phone_number: '',
            timezone: 'America/New_York',
            avatar_url: null
          }
        }
      );

      if (updateError) {
        console.log("Profile metadata update error:", updateError);
      }

      // Create default user preferences
      const { error: prefsError } = await supabase
        .from('user_preferences')
        .insert({
          user_id: data.user.id,
          ...getDefaultPreferences()
        });

      if (prefsError) {
        console.log("Preferences creation error:", prefsError);
      }
      
      console.log(`Initialized data for new user: ${data.user.id}`);
    }

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log("Signup error:", error);
    return c.json({ error: "Failed to create account" }, 500);
  }
});

// PROTECTED ENDPOINTS (REQUIRE AUTH)
// Apply auth middleware to protected routes only, excluding public endpoints
app.use('/make-server-966d4846/*', async (c, next) => {
  const path = c.req.path;
  console.log('Middleware checking path:', path);
  
  // Skip auth for public endpoints
  const publicEndpoints = ['/make-server-966d4846/health', '/make-server-966d4846/signup'];
  
  if (publicEndpoints.includes(path)) {
    console.log('Skipping auth for public endpoint:', path);
    await next();
    return;
  }
  
  console.log('Applying auth for protected endpoint:', path);
  // Apply auth middleware for all other endpoints
  return requireAuth(c, next);
});

// Get current user endpoint
app.get("/make-server-966d4846/me", async (c) => {
  try {
    const user = c.get('user');
    console.log(`User info requested for: ${user.id}`);
    
    // Enhance user object with profile data from metadata
    const enhancedUser = {
      ...user,
      profile: {
        first_name: user.user_metadata?.firstName || user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.lastName || user.user_metadata?.last_name || '',
        full_name: user.user_metadata?.name || `${user.user_metadata?.firstName || ''} ${user.user_metadata?.lastName || ''}`.trim(),
        phone_country_code: user.user_metadata?.phone_country_code || '+1',
        phone_number: user.user_metadata?.phone_number || '',
        timezone: user.user_metadata?.timezone || 'America/New_York',
        avatar_url: user.user_metadata?.avatar_url || null
      }
    };
    
    return c.json({ user: enhancedUser });
  } catch (error) {
    console.log("Get user error:", error);
    return c.json({ error: "Failed to get user" }, 500);
  }
});

// Profile endpoints - using auth.users table and user_metadata
app.get("/make-server-966d4846/profile", async (c) => {
  try {
    const user = c.get('user');
    
    // Extract profile data from user metadata
    const userMetadata = user.user_metadata || {};
    
    const profile = {
      id: user.id,
      first_name: userMetadata.firstName || userMetadata.first_name || '',
      last_name: userMetadata.lastName || userMetadata.last_name || '',
      email: user.email || '',
      phone_country_code: userMetadata.phone_country_code || '+1',
      phone_number: userMetadata.phone_number || '',
      timezone: userMetadata.timezone || 'America/New_York',
      avatar_url: userMetadata.avatar_url || null,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return c.json(profile);
  } catch (error) {
    console.log("Error fetching profile:", error);
    return c.json({ error: "Failed to fetch profile" }, 500);
  }
});

app.post("/make-server-966d4846/profile", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    console.log("Received profile data for user:", user.id);
    
    // Get current user metadata
    const currentMetadata = user.user_metadata || {};
    
    // Prepare updated metadata
    const updatedMetadata = { ...currentMetadata };
    
    // Map frontend fields to metadata fields
    if (body.first_name !== undefined) updatedMetadata.firstName = body.first_name;
    if (body.last_name !== undefined) updatedMetadata.lastName = body.last_name;
    if (body.phone_country_code !== undefined) updatedMetadata.phone_country_code = body.phone_country_code;
    if (body.phone_number !== undefined) updatedMetadata.phone_number = body.phone_number;
    if (body.timezone !== undefined) updatedMetadata.timezone = body.timezone;
    if (body.avatar_url !== undefined) updatedMetadata.avatar_url = body.avatar_url;
    
    // Update user name if first or last name changed
    if (updatedMetadata.firstName || updatedMetadata.lastName) {
      updatedMetadata.name = `${updatedMetadata.firstName || ''} ${updatedMetadata.lastName || ''}`.trim();
    }

    // Update user metadata in auth.users table
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: updatedMetadata
      }
    );

    if (updateError) {
      console.log("Error updating user metadata:", updateError);
      return c.json({ 
        error: "Failed to save profile",
        details: updateError.message
      }, 500);
    }

    console.log("Profile saved successfully for user:", user.id);
    return c.json({ success: true });
  } catch (error) {
    console.log("Unexpected error saving profile:", error);
    return c.json({ 
      error: "Failed to save profile", 
      details: error.message 
    }, 500);
  }
});

// User Preferences endpoints
app.get("/make-server-966d4846/preferences", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: preferences, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (prefsError) {
      console.log("Error fetching preferences:", prefsError);
      return c.json(getDefaultPreferences());
    }

    return c.json(preferences || getDefaultPreferences());
  } catch (error) {
    console.log("Error fetching preferences:", error);
    return c.json({ error: "Failed to fetch preferences" }, 500);
  }
});

app.post("/make-server-966d4846/preferences", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    console.log("Received preferences data for user:", user.id);

    // Local helper: normalize working days to full names without defaulting (server should respect empty)
    const normalizeWorkingDaysServer = (workingDays: any): string[] => {
      const dayMapping: Record<string, string> = {
        mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
        monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
      };
      const mapDay = (d: string) => dayMapping[d.toLowerCase()] || d;
      if (Array.isArray(workingDays)) {
        return workingDays.map((d) => mapDay(String(d))).filter(Boolean);
      }
      if (workingDays && typeof workingDays === 'object') {
        const keys = Object.keys(workingDays);
        const isNumeric = keys.every(k => !isNaN(Number(k)));
        if (isNumeric) return Object.values(workingDays).map(v => mapDay(String(v))).filter(Boolean);
        const truthyKeys = keys.filter(k => !!workingDays[k]);
        if (truthyKeys.length > 0) return truthyKeys.map(mapDay);
        return keys.map(mapDay);
      }
      return [];
    };

    // Sanitize incoming payload to match DB expectations
    const toHHMMSS = (t: any): string => {
      try {
        if (!t || typeof t !== 'string') return t;
        const parts = t.split(':');
        if (parts.length >= 3) {
          const hh = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const ss = (parts[2] ?? '00').padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        } else if (parts.length === 2) {
          const hh = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          return `${hh}:${mm}:00`;
        } else {
          return t;
        }
      } catch (_) {
        return t;
      }
    };

    // Normalize working days to a clean array of full day names
    if (body.calendar_working_days !== undefined) {
      body.calendar_working_days = normalizeWorkingDaysServer(body.calendar_working_days);
    }
    if (body.calendar_work_start !== undefined) {
      body.calendar_work_start = toHHMMSS(body.calendar_work_start);
    }
    if (body.calendar_work_end !== undefined) {
      body.calendar_work_end = toHHMMSS(body.calendar_work_end);
    }
    if (body.preferred_categories !== undefined && !Array.isArray(body.preferred_categories)) {
      body.preferred_categories = [];
    }
    
    // Check if user preferences record exists
    const { data: existingPrefs, error: checkError } = await supabase
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    // Prepare preferences data (calendar_* schema variant)
    const prefsDataCalendar: any = {
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    // Fields that belong in user_preferences table
    // Only include KNOWN columns from your DB to avoid 400 errors from unknown fields
    const preferencesFields = [
      'calendar_work_start',
      'calendar_work_end',
      'calendar_working_days',
      'calendar_buffer_time',
      'calendar_min_gap',
      'gap_sync_frequency',
      'autostart',
      'show_timer',
      'default_energy_level',
      'preferred_categories',
      'daily_reminder',
      'notification_activity_reminders',
      'notification_upcoming_gaps',
      'notification_lead_time',
      'dark_mode',
      'sound_enabled',
      'vibration_enabled',
      'manual_mode',
      'demo_mode',
      'timezone',
      'calendar_include_weekends',
      'quiet_hours_start',
      'quiet_hours_end',
      'calendar_event_status',
      'last_gap_sync',
      'google_access_token',
      'google_refresh_token',
      'google_token_expires_at'
    ];

    // Only include preferences fields in the database operation
    preferencesFields.forEach(field => {
      if (body[field] !== undefined) {
        prefsDataCalendar[field] = body[field];
      }
    });

    // Legacy schema variant mapping (only known legacy keys)
    const prefsDataLegacy: any = { user_id: user.id, updated_at: new Date().toISOString() };
    if (prefsDataCalendar.calendar_work_start !== undefined) prefsDataLegacy.work_start = prefsDataCalendar.calendar_work_start;
    if (prefsDataCalendar.calendar_work_end !== undefined) prefsDataLegacy.work_end = prefsDataCalendar.calendar_work_end;
    if (prefsDataCalendar.calendar_working_days !== undefined) {
      // Many schemas define working_days as text[] or jsonb
      // Ensure we pass an array; for text[] PostgREST expects JSON array and maps to text[] OK
      prefsDataLegacy.working_days = Array.isArray(prefsDataCalendar.calendar_working_days)
        ? prefsDataCalendar.calendar_working_days
        : [];
    }

    // Try saving with calendar_* schema first, then legacy mapping if needed
    let result;
    if (existingPrefs) {
      result = await supabase.from('user_preferences').update(prefsDataCalendar).eq('user_id', user.id);
      if (result.error) {
        console.log('Calendar schema update failed, trying legacy mapping:', result.error);
        result = await supabase.from('user_preferences').update(prefsDataLegacy).eq('user_id', user.id);
      }
    } else {
      const defaultPrefs = getDefaultPreferences();
      const insertCalendar = { ...defaultPrefs, ...prefsDataCalendar };
      result = await supabase.from('user_preferences').insert(insertCalendar);
      if (result.error) {
        console.log('Calendar schema insert failed, trying legacy mapping:', result.error);
        // Build legacy defaults
        const legacyDefaults: any = { ...defaultPrefs };
        legacyDefaults.work_start = defaultPrefs.calendar_work_start;
        legacyDefaults.work_end = defaultPrefs.calendar_work_end;
        legacyDefaults.working_days = defaultPrefs.calendar_working_days;
        delete legacyDefaults.calendar_work_start;
        delete legacyDefaults.calendar_work_end;
        delete legacyDefaults.calendar_working_days;
        const insertLegacy = { ...legacyDefaults, ...prefsDataLegacy };
        result = await supabase.from('user_preferences').insert(insertLegacy);
      }
    }

    if (result.error) {
      console.log("Database error details (first attempt):", result.error);
      // Fallback: retry with minimal safe fields only (calendar first, then legacy)
      const minimalFields = ['calendar_work_start','calendar_work_end','calendar_working_days'];
      const minimalCalendar: any = { user_id: user.id, updated_at: new Date().toISOString() };
      for (const f of minimalFields) if (body[f] !== undefined) minimalCalendar[f] = body[f];
      const minimalLegacy: any = { user_id: user.id, updated_at: new Date().toISOString() };
      if (minimalCalendar.calendar_work_start !== undefined) minimalLegacy.work_start = minimalCalendar.calendar_work_start;
      if (minimalCalendar.calendar_work_end !== undefined) minimalLegacy.work_end = minimalCalendar.calendar_work_end;
      if (minimalCalendar.calendar_working_days !== undefined) minimalLegacy.working_days = minimalCalendar.calendar_working_days;
      // Do NOT include optional fields in legacy fallback to avoid schema mismatches

      let fallbackResult;
      if (existingPrefs) {
        fallbackResult = await supabase.from('user_preferences').update(minimalCalendar).eq('user_id', user.id);
        if (fallbackResult.error) {
          console.log('Minimal calendar update failed, trying legacy:', fallbackResult.error);
          fallbackResult = await supabase.from('user_preferences').update(minimalLegacy).eq('user_id', user.id);
        }
      } else {
        fallbackResult = await supabase.from('user_preferences').insert(minimalCalendar);
        if (fallbackResult.error) {
          console.log('Minimal calendar insert failed, trying legacy:', fallbackResult.error);
          fallbackResult = await supabase.from('user_preferences').insert(minimalLegacy);
        }
      }

      if (fallbackResult.error) {
        console.log("Database error details (fallback attempt):", fallbackResult.error);
        return c.json({ 
          error: "Failed to save preferences",
          details: fallbackResult.error.message,
          code: fallbackResult.error.code
        }, 500);
      }
      console.log("Preferences saved successfully for user (fallback):", user.id);
      return c.json({ success: true, fallback: true });
    }

    console.log("Preferences saved successfully for user:", user.id);
    return c.json({ success: true });
  } catch (error) {
    console.log("Unexpected error saving preferences:", error);
    return c.json({ 
      error: "Failed to save preferences", 
      details: error.message 
    }, 500);
  }
});

// Preferences PATCH endpoint: partial update + optimistic concurrency + canonical return
app.patch("/make-server-966d4846/preferences", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();

    // Extract and remove optimistic concurrency header from body if present
    const expectedUpdatedAt = body.expected_updated_at;
    if (expectedUpdatedAt !== undefined) {
      delete body.expected_updated_at;
    }

    // Reuse normalization helpers from POST
    const normalizeWorkingDaysServer = (workingDays: any): string[] => {
      const dayMapping: Record<string, string> = {
        mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
        monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
      };
      const mapDay = (d: string) => dayMapping[d.toLowerCase()] || d;
      if (Array.isArray(workingDays)) {
        return workingDays.map((d) => mapDay(String(d))).filter(Boolean);
      }
      if (workingDays && typeof workingDays === 'object') {
        const keys = Object.keys(workingDays);
        const isNumeric = keys.every(k => !isNaN(Number(k)));
        if (isNumeric) return Object.values(workingDays).map(v => mapDay(String(v))).filter(Boolean);
        const truthyKeys = keys.filter(k => !!(workingDays as any)[k]);
        if (truthyKeys.length > 0) return truthyKeys.map(mapDay);
        return keys.map(mapDay);
      }
      return [];
    };

    const toHHMMSS = (t: any): string => {
      try {
        if (!t || typeof t !== 'string') return t;
        const parts = t.split(':');
        if (parts.length >= 3) {
          const hh = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const ss = (parts[2] ?? '00').padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        } else if (parts.length === 2) {
          const hh = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          return `${hh}:${mm}:00`;
        } else {
          return t;
        }
      } catch (_) {
        return t;
      }
    };

    // Field whitelist should match POST
    const preferencesFields = [
      'calendar_work_start',
      'calendar_work_end',
      'calendar_working_days',
      'calendar_buffer_time',
      'calendar_min_gap',
      'gap_sync_frequency',
      'autostart',
      'show_timer',
      'default_energy_level',
      'preferred_categories',
      'daily_reminder',
      'notification_activity_reminders',
      'notification_upcoming_gaps',
      'notification_lead_time',
      'dark_mode',
      'sound_enabled',
      'vibration_enabled',
      'manual_mode',
      'demo_mode',
      'timezone',
      'calendar_include_weekends',
      'quiet_hours_start',
      'quiet_hours_end',
      'calendar_event_status',
      'last_gap_sync',
      'google_access_token',
      'google_refresh_token',
      'google_token_expires_at'
    ];

    // Normalize specific inputs if present
    if (body.calendar_working_days !== undefined) {
      body.calendar_working_days = normalizeWorkingDaysServer(body.calendar_working_days);
    }
    if (body.calendar_work_start !== undefined) {
      body.calendar_work_start = toHHMMSS(body.calendar_work_start);
    }
    if (body.calendar_work_end !== undefined) {
      body.calendar_work_end = toHHMMSS(body.calendar_work_end);
    }
    if (body.preferred_categories !== undefined && !Array.isArray(body.preferred_categories)) {
      body.preferred_categories = [];
    }

    // Verify record exists
    const { data: existing, error: checkError } = await supabase
      .from('user_preferences')
      .select('user_id, updated_at')
      .eq('user_id', user.id)
      .single();

    if (checkError) {
      // If not found, fall back to insert path using POST behavior
      // Return conflict-style message to suggest caller use POST for first-time create
      return c.json({ error: 'Preferences not initialized for user', code: 'not_found' }, 404);
    }

    // Optimistic concurrency check
    if (expectedUpdatedAt) {
      const currentTs = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const expectedTs = new Date(expectedUpdatedAt).getTime();
      if (currentTs !== expectedTs) {
        return c.json({ error: 'Conflict', code: 'version_conflict', current_updated_at: existing?.updated_at }, 409);
      }
    }

    const update: any = { updated_at: new Date().toISOString() };
    preferencesFields.forEach((f) => {
      if (body[f] !== undefined) update[f] = body[f];
    });

    if (Object.keys(update).length === 1) { // only updated_at
      // No-op update, return canonical
      const { data: canonical } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return c.json(canonical || getDefaultPreferences());
    }

    const { error: updateError } = await supabase
      .from('user_preferences')
      .update(update)
      .eq('user_id', user.id);

    if (updateError) {
      return c.json({ error: 'Failed to update preferences', details: updateError.message }, 500);
    }

    // Return canonical
    const { data: preferences, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      return c.json({ error: 'Failed to fetch preferences after update' }, 500);
    }

    return c.json(preferences || getDefaultPreferences());
  } catch (error) {
    return c.json({ error: 'Failed to update preferences', details: (error as any)?.message }, 500);
  }
});

// Tasks endpoints
app.get("/make-server-966d4846/tasks", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.log("Error fetching tasks:", tasksError);
      return c.json({ error: "Failed to fetch tasks" }, 500);
    }

    // Transform database tasks to frontend format
    const transformedTasks = (tasks || []).map((task: any) => {
      const dueDateTime = splitTimestamp(task.due_date);
      const reminderDateTime = splitTimestamp(task.reminder_date);
      
      return {
        id: task.id,
        user_id: task.user_id,
        title: task.title,
        category: task.category,
        duration: formatDurationFromMinutes(task.duration),
        dueDate: dueDateTime.date,
        dueTime: dueDateTime.time,
        status: task.completed ? 'completed' : 'draft',
        isTimerRunning: false,
        timerRemaining: task.duration * 60,
        timerTotal: task.duration * 60,
        iconColor: getDefaultIconColor(task.category),
        icon: getDefaultIcon(task.category),
        notes: task.notes,
        energyLevel: task.energy_level,
        reminderDate: reminderDateTime.date,
        reminderTime: reminderDateTime.time,
        priority: task.priority,
        scheduledGapId: null,
        googleCalendarEventId: null,
        completedSessions: 0,
        isCompleted: task.completed || false,
        is_completed: task.completed || false,
        timerStoppedAt: task.timerStoppedAt,
        created_at: task.created_at,
        updated_at: task.updated_at
      };
    });

    return c.json(transformedTasks);
  } catch (error) {
    console.log("Error fetching tasks:", error);
    return c.json({ error: "Failed to fetch tasks" }, 500);
  }
});

app.post("/make-server-966d4846/tasks", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const tasks = await c.req.json();
    
    // Delete all existing tasks for this user
    await supabase.from('tasks').delete().eq('user_id', user.id);
    
    // Insert new tasks if any
    if (tasks && tasks.length > 0) {
      const tasksWithUserId = tasks.map((task: any) => {
        // Ensure task has a proper UUID
        const taskId = task.id && task.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) 
          ? task.id 
          : generateUUID();

        const dbTask = {
          id: taskId,
          user_id: user.id,
          title: task.title,
          category: task.category || 'Personal',
          duration: typeof task.duration === 'string' ? parseDurationToMinutes(task.duration) : (task.duration || 0),
          energy_level: task.energyLevel || 'Medium',
          notes: task.notes || null,
          priority: task.priority || 'Medium',
          completed: task.isCompleted || task.is_completed || false,
          due_date: combineDateAndTime(task.dueDate, task.dueTime),
          reminder_date: combineDateAndTime(task.reminderDate, task.reminderTime),
          timerStoppedAt: task.timerStoppedAt || null,
          created_at: task.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Remove undefined fields
        Object.keys(dbTask).forEach(key => {
          if (dbTask[key] === undefined) {
            delete dbTask[key];
          }
        });

        return dbTask;
      });

      console.log("Inserting tasks for user:", user.id, "Tasks count:", tasksWithUserId.length);

      const { error: insertError } = await supabase
        .from('tasks')
        .insert(tasksWithUserId);

      if (insertError) {
        console.log("Error saving tasks:", insertError);
        return c.json({ error: "Failed to save tasks", details: insertError.message }, 500);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.log("Error saving tasks:", error);
    return c.json({ error: "Failed to save tasks" }, 500);
  }
});

// Individual task endpoints for CRUD operations
app.post("/make-server-966d4846/tasks/create", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const task = await c.req.json();
    
    // Ensure task has a proper UUID
    const taskId = task.id && task.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) 
      ? task.id 
      : generateUUID();

    const dbTask = {
      id: taskId,
      user_id: user.id,
      title: task.title,
      category: task.category || 'Personal',
      duration: typeof task.duration === 'string' ? parseDurationToMinutes(task.duration) : (task.duration || 0),
      energy_level: task.energyLevel || 'Medium',
      notes: task.notes || null,
      priority: task.priority || 'Medium',
      completed: task.isCompleted || task.is_completed || false,
      due_date: combineDateAndTime(task.dueDate, task.dueTime),
      reminder_date: combineDateAndTime(task.reminderDate, task.reminderTime),
      timerStoppedAt: task.timerStoppedAt || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Remove undefined fields
    Object.keys(dbTask).forEach(key => {
      if (dbTask[key] === undefined) {
        delete dbTask[key];
      }
    });
    
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert(dbTask)
      .select()
      .single();

    if (insertError) {
      console.log("Error creating task:", insertError);
      return c.json({ error: "Failed to create task" }, 500);
    }

    // Transform database task back to frontend format
    const dueDateTime = splitTimestamp(newTask.due_date);
    const reminderDateTime = splitTimestamp(newTask.reminder_date);
    
    const transformedTask = {
      id: newTask.id,
      user_id: newTask.user_id,
      title: newTask.title,
      category: newTask.category,
      duration: formatDurationFromMinutes(newTask.duration),
      dueDate: dueDateTime.date,
      dueTime: dueDateTime.time,
      status: newTask.completed ? 'completed' : 'draft',
      isTimerRunning: false,
      timerRemaining: newTask.duration * 60,
      timerTotal: newTask.duration * 60,
      iconColor: getDefaultIconColor(newTask.category),
      icon: getDefaultIcon(newTask.category),
      notes: newTask.notes,
      energyLevel: newTask.energy_level,
      reminderDate: reminderDateTime.date,
      reminderTime: reminderDateTime.time,
      priority: newTask.priority,
      scheduledGapId: null,
      googleCalendarEventId: null,
      completedSessions: 0,
      isCompleted: newTask.completed || false,
      is_completed: newTask.completed || false,
      timerStoppedAt: newTask.timerStoppedAt,
      created_at: newTask.created_at,
      updated_at: newTask.updated_at
    };

    return c.json(transformedTask);
  } catch (error) {
    console.log("Error creating task:", error);
    return c.json({ error: "Failed to create task" }, 500);
  }
});

// Sync endpoint for tasks with timestamp comparison
app.put("/make-server-966d4846/tasks/:id/sync", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const taskId = c.req.param('id');
    const task = await c.req.json();

    // Get the existing task to compare timestamps
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .single();

    // Compare timestamps
    const localTimestamp = new Date(task.updated_at || '').getTime();
    const serverTimestamp = existingTask ? new Date(existingTask.updated_at || '').getTime() : 0;

    // Only update if local version is newer
    if (!existingTask || localTimestamp > serverTimestamp) {
      const dbTask = {
        id: taskId,
        user_id: user.id,
        title: task.title,
        category: task.category || 'Personal',
        duration: typeof task.duration === 'string' ? parseDurationToMinutes(task.duration) : (task.duration || 0),
        energy_level: task.energyLevel || 'Medium',
        notes: task.notes || null,
        priority: task.priority || 'Medium',
        completed: task.isCompleted || task.is_completed || false,
        due_date: combineDateAndTime(task.dueDate, task.dueTime),
        reminder_date: combineDateAndTime(task.reminderDate, task.reminderTime),
        timerStoppedAt: task.timerStoppedAt || null,
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || new Date().toISOString()
      };

      const { data: updatedTask, error: updateError } = await supabase
        .from('tasks')
        .upsert(dbTask)
        .select()
        .single();

      if (updateError) {
        console.log("Error updating task:", updateError);
        return c.json({ error: "Failed to update task" }, 500);
      }

      // Transform database task back to frontend format
      const dueDateTime = splitTimestamp(updatedTask.due_date);
      const reminderDateTime = splitTimestamp(updatedTask.reminder_date);
      
      const transformedTask = {
        id: updatedTask.id,
        user_id: updatedTask.user_id,
        title: updatedTask.title,
        category: updatedTask.category,
        duration: formatDurationFromMinutes(updatedTask.duration),
        dueDate: dueDateTime.date,
        dueTime: dueDateTime.time,
        status: updatedTask.completed ? 'completed' : 'draft',
        isTimerRunning: false,
        timerRemaining: updatedTask.duration * 60,
        timerTotal: updatedTask.duration * 60,
        iconColor: getDefaultIconColor(updatedTask.category),
        icon: getDefaultIcon(updatedTask.category),
        notes: updatedTask.notes,
        energyLevel: updatedTask.energy_level,
        reminderDate: reminderDateTime.date,
        reminderTime: reminderDateTime.time,
        priority: updatedTask.priority,
        scheduledGapId: null,
        googleCalendarEventId: null,
        completedSessions: 0,
        isCompleted: updatedTask.completed || false,
        is_completed: updatedTask.completed || false,
        timerStoppedAt: updatedTask.timerStoppedAt,
        created_at: updatedTask.created_at,
        updated_at: updatedTask.updated_at
      };

      return c.json(transformedTask);
    } else {
      // Local version is older or same, return server version
      return c.json(existingTask);
    }
  } catch (error) {
    console.log("Error syncing task:", error);
    return c.json({ error: "Failed to sync task" }, 500);
  }
});

app.put("/make-server-966d4846/tasks/:id", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const taskId = c.req.param('id');
    const updates = await c.req.json();

    // Transform frontend update fields to database fields
    const dbUpdates: any = {
      updated_at: new Date().toISOString()
    };

    // Map frontend fields to database fields
    if (updates.title !== undefined) dbUpdates.title = updates.title;  
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.duration !== undefined) {
      dbUpdates.duration = typeof updates.duration === 'string' 
        ? parseDurationToMinutes(updates.duration) 
        : updates.duration;
    }
    if (updates.energyLevel !== undefined) dbUpdates.energy_level = updates.energyLevel;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.isCompleted !== undefined) dbUpdates.completed = updates.isCompleted;
    if (updates.is_completed !== undefined) dbUpdates.completed = updates.is_completed;
    
    // Handle due date - combine dueDate and dueTime if both are provided
    if (updates.dueDate !== undefined || updates.dueTime !== undefined) {
      // Get existing task data to preserve missing date/time parts
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('due_date')
        .eq('id', taskId)
        .eq('user_id', user.id)
        .single();
      
      let existingDate = null;
      let existingTime = null;
      if (existingTask?.due_date) {
        const existing = new Date(existingTask.due_date);
        existingDate = existing.toISOString().split('T')[0];
        existingTime = existing.toTimeString().slice(0, 5);
      }
      
      const finalDate = updates.dueDate !== undefined ? updates.dueDate : existingDate;
      const finalTime = updates.dueTime !== undefined ? updates.dueTime : existingTime;
      
      dbUpdates.due_date = combineDateAndTime(finalDate, finalTime);
    }
    
    // Handle reminder date - combine reminderDate and reminderTime if both are provided
    if (updates.reminderDate !== undefined || updates.reminderTime !== undefined) {
      // Get existing task data to preserve missing date/time parts
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('reminder_date')
        .eq('id', taskId)
        .eq('user_id', user.id)
        .single();
      
      let existingDate = null;
      let existingTime = null;
      if (existingTask?.reminder_date) {
        const existing = new Date(existingTask.reminder_date);
        existingDate = existing.toISOString().split('T')[0];
        existingTime = existing.toTimeString().slice(0, 5);
      }
      
      const finalDate = updates.reminderDate !== undefined ? updates.reminderDate : existingDate;
      const finalTime = updates.reminderTime !== undefined ? updates.reminderTime : existingTime;
      
      dbUpdates.reminder_date = combineDateAndTime(finalDate, finalTime);
    }
    
    if (updates.timerStoppedAt !== undefined) dbUpdates.timerStoppedAt = updates.timerStoppedAt;
    
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', taskId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.log("Error updating task:", updateError);
      return c.json({ error: "Failed to update task" }, 500);
    }

    // Transform database task back to frontend format
    const dueDateTime = splitTimestamp(updatedTask.due_date);
    const reminderDateTime = splitTimestamp(updatedTask.reminder_date);
    
    const transformedTask = {
      id: updatedTask.id,
      user_id: updatedTask.user_id,
      title: updatedTask.title,
      category: updatedTask.category,
      duration: formatDurationFromMinutes(updatedTask.duration),
      dueDate: dueDateTime.date,
      dueTime: dueDateTime.time,
      status: updatedTask.completed ? 'completed' : 'draft',
      isTimerRunning: false,
      timerRemaining: updatedTask.duration * 60,
      timerTotal: updatedTask.duration * 60,
      iconColor: getDefaultIconColor(updatedTask.category),
      icon: getDefaultIcon(updatedTask.category),
      notes: updatedTask.notes,
      energyLevel: updatedTask.energy_level,
      reminderDate: reminderDateTime.date,
      reminderTime: reminderDateTime.time,
      priority: updatedTask.priority,
      scheduledGapId: null,
      googleCalendarEventId: null,
      completedSessions: 0,
      isCompleted: updatedTask.completed || false,
      is_completed: updatedTask.completed || false,
      timerStoppedAt: updatedTask.timerStoppedAt,
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at
    };

    return c.json(transformedTask);
  } catch (error) {
    console.log("Error updating task:", error);
    return c.json({ error: "Failed to update task" }, 500);
  }
});

app.delete("/make-server-966d4846/tasks/:id", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const taskId = c.req.param('id');
    
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.log("Error deleting task:", deleteError);
      return c.json({ error: "Failed to delete task" }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log("Error deleting task:", error);
    return c.json({ error: "Failed to delete task" }, 500);
  }
});

// Create a new gap endpoint
app.post("/make-server-966d4846/gaps/create", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    console.log('🆕 [Gap Create] Request:', body);

    const gapData = {
      id: generateUUID(),
      user_id: user.id,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      duration_minutes: body.duration_minutes || calculateDuration(body.start_time, body.end_time),
      parent_gap_id: body.parent_gap_id || null,
      original_gap_id: body.original_gap_id || null,
      created_at: new Date().toISOString(),
      updated_at: body.updated_at || new Date().toISOString(),
      modified_by: body.modified_by || 'user'
    };

    const { data: newGap, error: insertError } = await supabase
      .from('gaps')
      .insert(gapData)
      .select()
      .single();

    if (insertError) {
      console.log('❌ [Gap Create] Error:', insertError);
      return c.json({ error: "Failed to create gap" }, 500);
    }

    console.log('✅ [Gap Create] Success:', newGap);
    return c.json(newGap);

  } catch (error) {
    console.log('❌ [Gap Create] Unexpected error:', error);
    return c.json({ error: "Failed to create gap" }, 500);
  }
});

// Calendar gaps endpoints with simplified gap logic
app.post("/make-server-966d4846/gaps/schedule", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { gapId, taskStartTime, taskEndTime, taskData } = body;
    
    console.log('🔄 [Gap Schedule] Request:', {
      gapId,
      taskStartTime,
      taskEndTime,
      taskData: taskData?.title,
      userId: user.id
    });

    // Validate input
    if (!gapId || !taskStartTime || !taskEndTime || !taskData) {
      return c.json({ error: "Missing required fields: gapId, taskStartTime, taskEndTime, taskData" }, 400);
    }

    // Find the gap to split
    const { data: originalGap, error: findError } = await supabase
      .from('gaps')
      .select('*')
      .eq('id', gapId)
      .eq('user_id', user.id)
      .single();

    if (findError || !originalGap) {
      console.log('❌ [Gap Schedule] Gap not found:', { gapId, error: findError });
      return c.json({ error: `Gap not found: ${gapId}` }, 404);
    }

    console.log('📍 [Gap Schedule] Found gap:', {
      id: originalGap.id,
      start_time: originalGap.start_time,
      end_time: originalGap.end_time,
      duration_minutes: originalGap.duration_minutes
    });

    // Helper function to convert minutes to HH:MM
    const minutesToTimeLocal = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    // Helper function to convert HH:MM to minutes
    const timeToMinutesLocal = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Parse times
    const gapStartMinutes = timeToMinutesLocal(originalGap.start_time);
    const gapEndMinutes = timeToMinutesLocal(originalGap.end_time);
    const taskStartMinutes = timeToMinutesLocal(taskStartTime);
    const taskEndMinutes = timeToMinutesLocal(taskEndTime);

    // Validate task fits within gap
    if (taskStartMinutes < gapStartMinutes || taskEndMinutes > gapEndMinutes) {
      return c.json({ 
        error: "Task time range exceeds gap boundaries",
        details: {
          gap: `${originalGap.start_time} - ${originalGap.end_time}`,
          task: `${taskStartTime} - ${taskEndTime}`
        }
      }, 400);
    }

    // Calculate remaining gaps
    const newGaps = [];
    
    // Gap before task (if any)
    if (taskStartMinutes > gapStartMinutes) {
      const beforeGapDuration = taskStartMinutes - gapStartMinutes;
      newGaps.push({
        id: generateUUID(),
        user_id: user.id,
        date: originalGap.date,
        start_time: originalGap.start_time,
        end_time: taskStartTime,
        duration_minutes: beforeGapDuration,
        parent_gap_id: originalGap.id,
        original_gap_id: originalGap.original_gap_id || originalGap.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'user'
      });
    }

    // Gap after task (if any)
    if (taskEndMinutes < gapEndMinutes) {
      const afterGapDuration = gapEndMinutes - taskEndMinutes;
      newGaps.push({
        id: generateUUID(),
        user_id: user.id,
        date: originalGap.date,
        start_time: taskEndTime,
        end_time: originalGap.end_time,
        duration_minutes: afterGapDuration,
        parent_gap_id: originalGap.id,
        original_gap_id: originalGap.original_gap_id || originalGap.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'user'
      });
    }

    // Execute the split in a transaction
    // 1. Delete original gap
    const { error: deleteError } = await supabase
      .from('gaps')
      .delete()
      .eq('id', gapId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.log('❌ [Gap Schedule] Error deleting original gap:', deleteError);
      return c.json({ error: "Failed to delete original gap" }, 500);
    }

    // 2. Insert new gaps (if any)
    if (newGaps.length > 0) {
      const { error: insertError } = await supabase
        .from('gaps')
        .insert(newGaps);

      if (insertError) {
        console.log('❌ [Gap Schedule] Error inserting new gaps:', insertError);
        return c.json({ error: "Failed to create new gaps" }, 500);
      }
    }

    // 3. Create/update the task
    const taskWithGap = {
      ...taskData,
      id: taskData.id || generateUUID(),
      user_id: user.id,
      scheduled_gap_id: gapId,
      dueDate: originalGap.date,
      dueTime: taskStartTime,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: createdTask, error: taskError } = await supabase
      .from('tasks')
      .upsert(taskWithGap)
      .select()
      .single();

    if (taskError) {
      console.log('❌ [Gap Schedule] Error creating task:', taskError);
      return c.json({ error: "Failed to create task" }, 500);
    }

    console.log('✅ [Gap Schedule] Successfully scheduled task:', {
      originalGapId: gapId,
      newGapsCount: newGaps.length,
      taskId: createdTask.id,
      newGaps: newGaps.map(g => ({ id: g.id, start_time: g.start_time, end_time: g.end_time }))
    });

    return c.json({ 
      success: true, 
      originalGapId: gapId,
      newGaps: newGaps,
      task: createdTask
    });

  } catch (error) {
    console.log('❌ [Gap Schedule] Unexpected error:', error);
    return c.json({ error: "Failed to schedule task" }, 500);
  }
});

app.get("/make-server-966d4846/gaps", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const date = c.req.query('date'); // Optional date filter

    let query = supabase
      .from('gaps')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: true });

    if (date) {
      query = query.eq('date', date);
    }

    const { data: gaps, error: gapsError } = await query;

    if (gapsError) {
      console.log("Error fetching gaps:", gapsError);
      return c.json({ error: "Failed to fetch gaps" }, 500);
    }

    return c.json(gaps || []);
  } catch (error) {
    console.log("Error in gaps endpoint:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/make-server-966d4846/gaps/initialize", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { date, preferences } = body;
    
    console.log('🚀 [Gap Initialize] Request:', {
      date,
      userId: user.id
    });

    if (!date || !preferences) {
      return c.json({ error: "Missing required fields: date, preferences" }, 400);
    }

    // Check if gaps already exist for this date
    const { data: existingGaps, error: checkError } = await supabase
      .from('gaps')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', date);

    if (checkError) {
      console.log('❌ [Gap Initialize] Error checking existing gaps:', checkError);
      return c.json({ error: "Failed to check existing gaps" }, 500);
    }

    if (existingGaps && existingGaps.length > 0) {
      console.log('✅ [Gap Initialize] Gaps already exist for date:', date);
      return c.json({ message: "Gaps already exist for this date", gaps: existingGaps });
    }

    // Create default free hour gaps
    const workStart = timeToMinutes(preferences.calendar_work_start);
    const workEnd = timeToMinutes(preferences.calendar_work_end);
    const gaps = [];

    // Create one gap per hour
    for (let hour = workStart; hour < workEnd; hour += 60) {
      const startTime = minutesToTime(hour);
      const endTime = minutesToTime(Math.min(hour + 60, workEnd));
      
      gaps.push({
        id: generateUUID(),
        user_id: user.id,
        date,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: Math.min(60, workEnd - hour),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'system'
      });
    }

    // Insert gaps
    const { data: insertedGaps, error: insertError } = await supabase
      .from('gaps')
      .insert(gaps)
      .select();

    if (insertError) {
      console.log('❌ [Gap Initialize] Error inserting gaps:', insertError);
      return c.json({ error: "Failed to create gaps" }, 500);
    }

    console.log('✅ [Gap Initialize] Successfully created gaps:', {
      date,
      gapCount: insertedGaps.length
    });

    return c.json({ 
      success: true, 
      message: `Created ${insertedGaps.length} gaps for ${date}`,
      gaps: insertedGaps
    });

  } catch (error) {
    console.log('❌ [Gap Initialize] Unexpected error:', error);
    return c.json({ error: "Failed to initialize gaps" }, 500);
  }
});

// Get gaps within rolling window (14-day window)
app.get("/make-server-966d4846/gaps/rolling-window", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    
    // Calculate 14-day rolling window
    const today = new Date();
    const window_start = new Date(today);
    window_start.setDate(today.getDate() - 7);
    const window_end = new Date(today);
    window_end.setDate(today.getDate() + 7);
    
    const startDate = window_start.toISOString().split('T')[0];
    const endDate = window_end.toISOString().split('T')[0];

    console.log(`📅 [Rolling Window] Fetching gaps for ${startDate} to ${endDate}`);

    const { data: gaps, error: gapsError } = await supabase
      .from('gaps')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (gapsError) {
      console.log("❌ [Rolling Window] Error fetching gaps:", gapsError);
      return c.json({ error: "Failed to fetch rolling window gaps" }, 500);
    }

    console.log(`✅ [Rolling Window] Retrieved ${gaps?.length || 0} gaps`);
    return c.json(gaps || []);
  } catch (error) {
    console.log("❌ [Rolling Window] Unexpected error:", error);
    return c.json({ error: "Failed to fetch rolling window gaps" }, 500);
  }
});

// Clean up old gaps outside rolling window
app.post("/make-server-966d4846/gaps/cleanup", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { gapIds } = body;
    
    if (!gapIds || !Array.isArray(gapIds)) {
      return c.json({ error: "Missing or invalid gapIds array" }, 400);
    }

    console.log(`🧹 [Cleanup] Deleting ${gapIds.length} old gaps for user ${user.id}`);

    // Delete the specified gaps
    const { error: deleteError } = await supabase
      .from('gaps')
      .delete()
      .eq('user_id', user.id)
      .in('id', gapIds);

    if (deleteError) {
      console.log("❌ [Cleanup] Error deleting gaps:", deleteError);
      return c.json({ error: "Failed to cleanup old gaps" }, 500);
    }

    console.log(`✅ [Cleanup] Successfully deleted ${gapIds.length} old gaps`);
    return c.json({ 
      success: true, 
      deleted: gapIds.length,
      message: `Cleaned up ${gapIds.length} old gaps`
    });

  } catch (error) {
    console.log("❌ [Cleanup] Unexpected error:", error);
    return c.json({ error: "Failed to cleanup old gaps" }, 500);
  }
});

// Preload gaps for smooth scrolling (+3 days beyond rolling window)
app.post("/make-server-966d4846/gaps/preload", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { preferences } = body;
    
    if (!preferences) {
      return c.json({ error: "Missing preferences" }, 400);
    }

    // Calculate preload dates (+3 days beyond rolling window)
    const today = new Date();
    const window_end = new Date(today);
    window_end.setDate(today.getDate() + 7);
    
    const preloadDates = [];
    for (let i = 1; i <= 3; i++) {
      const preloadDate = new Date(window_end);
      preloadDate.setDate(preloadDate.getDate() + i);
      preloadDates.push(preloadDate.toISOString().split('T')[0]);
    }

    console.log(`🔄 [Preload] Creating gaps for ${preloadDates.length} dates:`, preloadDates);

    const allGaps = [];
    
    for (const date of preloadDates) {
      // Check if gaps already exist for this date
      const { data: existingGaps } = await supabase
        .from('gaps')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date);

      if (existingGaps && existingGaps.length > 0) {
        console.log(`⏭️ [Preload] Gaps already exist for ${date}`);
        continue;
      }

      // Create gaps for this date
      const workStart = timeToMinutes(preferences.calendar_work_start);
      const workEnd = timeToMinutes(preferences.calendar_work_end);
      const gaps = [];

      // Create one gap per hour
      for (let hour = workStart; hour < workEnd; hour += 60) {
        const startTime = minutesToTime(hour);
        const endTime = minutesToTime(Math.min(hour + 60, workEnd));
        
        gaps.push({
          id: generateUUID(),
          user_id: user.id,
          date,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: Math.min(60, workEnd - hour),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          modified_by: 'system'
        });
      }

      allGaps.push(...gaps);
    }

    if (allGaps.length > 0) {
      // Insert all preloaded gaps
      const { data: insertedGaps, error: insertError } = await supabase
        .from('gaps')
        .insert(allGaps)
        .select();

      if (insertError) {
        console.log("❌ [Preload] Error inserting preloaded gaps:", insertError);
        return c.json({ error: "Failed to preload gaps" }, 500);
      }

      console.log(`✅ [Preload] Successfully created ${insertedGaps.length} preloaded gaps`);
      return c.json({ 
        success: true, 
        preloaded: insertedGaps.length,
        message: `Preloaded ${insertedGaps.length} gaps`
      });
    } else {
      console.log(`✅ [Preload] No gaps needed to preload`);
      return c.json({ 
        success: true, 
        preloaded: 0,
        message: "No gaps needed to preload"
      });
    }

  } catch (error) {
    console.log("❌ [Preload] Unexpected error:", error);
    return c.json({ error: "Failed to preload gaps" }, 500);
  }
});

// Helper functions
const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Discover/explore endpoints for activity suggestions
app.get("/make-server-966d4846/discover", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: activities, error: activitiesError } = await supabase
      .from('explore')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (activitiesError) {
      console.log("Error fetching discover activities:", activitiesError);
      return c.json([], 500);
    }

    return c.json(activities || []);
  } catch (error) {
    console.log("Error fetching discover activities:", error);
    return c.json({ error: "Failed to fetch activities" }, 500);
  }
});

// Suggestions endpoint for homepage 
app.get("/make-server-966d4846/suggestions", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    // Get a few random suggestions from explore table
    const { data: suggestions, error: suggestionsError } = await supabase
      .from('explore')
      .select('*')
      .eq('user_id', user.id)
      .limit(6);

    if (suggestionsError) {
      console.log("Error fetching suggestions:", suggestionsError);
      return c.json([]);
    }

    return c.json(suggestions || []);
  } catch (error) {
    console.log("Error fetching suggestions:", error);
    return c.json([]);
  }
});

// Google Calendar endpoints
app.get("/make-server-966d4846/google-calendar/status", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: preferences, error: prefsError } = await supabase
      .from('user_preferences')
      .select('google_calendar_connected, google_calendar_email, google_calendar_last_sync')
      .eq('user_id', user.id)
      .single();

    if (prefsError) {
      return c.json({
        connected: false,
        email: null,
        lastSync: null,
        gapsCount: 0
      });
    }

    // Count available gaps
    const { data: gaps, error: gapsError } = await supabase
      .from('gaps')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_available', true);

    return c.json({
      connected: preferences?.google_calendar_connected || false,
      email: preferences?.google_calendar_email || null,
      lastSync: preferences?.google_calendar_last_sync || null,
      gapsCount: gaps?.length || 0
    });
  } catch (error) {
    console.log("Error fetching calendar status:", error);
    return c.json({ error: "Failed to fetch calendar status" }, 500);
  }
});

// Create Google Calendar event endpoint
app.post("/make-server-966d4846/google-calendar/create-event", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { title, startDateTime, endDateTime, description, location } = body;
    
    console.log('📅 [Calendar Event] Creating event:', {
      title,
      startDateTime,
      endDateTime,
      userId: user.id
    });

    // Get user's Google Calendar credentials
    const { data: preferences, error: prefsError } = await supabase
      .from('user_preferences')
      .select('google_calendar_connected, google_calendar_access_token, google_calendar_refresh_token')
      .eq('user_id', user.id)
      .single();

    if (prefsError || !preferences?.google_calendar_connected || !preferences?.google_calendar_access_token) {
      return c.json({ error: "Google Calendar not connected" }, 400);
    }

    // Create Google Calendar event
    const eventData = {
      summary: title,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/New_York', // TODO: Use user's actual timezone
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/New_York',
      },
      description: description || 'Created by Gaply',
      location: location || ''
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${preferences.google_calendar_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ [Calendar Event] Google API Error:', errorText);
      
      // If token is expired, we might need to refresh it
      if (response.status === 401) {
        // TODO: Implement token refresh logic
        return c.json({ error: "Calendar access expired. Please reconnect your calendar." }, 401);
      }
      
      return c.json({ error: "Failed to create calendar event" }, response.status);
    }

    const createdEvent = await response.json();
    
    console.log('✅ [Calendar Event] Event created successfully:', {
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink
    });

    return c.json({
      success: true,
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
      event: createdEvent
    });
  } catch (error) {
    console.log('❌ [Calendar Event] Unexpected error:', error);
    return c.json({ error: "Failed to create calendar event" }, 500);
  }
});

// Default explore activities for new users or empty tables
const getDefaultExploreActivities = () => [
  {
    id: 'exp-1',
    title: 'Quick Meditation',
    category: 'Health',
    duration: 5,
    color: 'bg-green-500',
    icon: 'Heart',
    rating: 4.8,
    description: 'A short mindfulness meditation'
  },
  {
    id: 'exp-2',
    title: 'Stretching Break',
    category: 'Health',
    duration: 10,
    color: 'bg-green-500',
    icon: 'Heart',
    rating: 4.5,
    description: 'Quick stretching routine'
  },
  {
    id: 'exp-3',
    title: 'Read Article',
    category: 'Learning',
    duration: 15,
    color: 'bg-yellow-500',
    icon: 'BookOpen',
    rating: 4.3,
    description: 'Read an interesting article'
  },
  {
    id: 'exp-4',
    title: 'Quick Walk',
    category: 'Health',
    duration: 10,
    color: 'bg-green-500',
    icon: 'Heart',
    rating: 4.7,
    description: 'Take a refreshing walk outside'
  },
  {
    id: 'exp-5',
    title: 'Organize Desk',
    category: 'Personal',
    duration: 5,
    color: 'bg-blue-500',
    icon: 'User',
    rating: 4.0,
    description: 'Tidy up your workspace'
  }
];

// Explore/Activities endpoints for discover tab and home suggestions
app.get("/make-server-966d4846/explore", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: exploreActivities, error: exploreError } = await supabase
      .from('explore')
      .select('*')
      .eq('user_id', user.id)
      .order('title', { ascending: true });

    if (exploreError) {
      console.log("Error fetching explore activities:", exploreError);
      // Return default activities if table doesn't exist or error occurs
      return c.json(getDefaultExploreActivities());
    }

    // If no activities found, return defaults
    if (!exploreActivities || exploreActivities.length === 0) {
      console.log("No explore activities found, returning defaults");
      return c.json(getDefaultExploreActivities());
    }

    // Transform to match expected frontend format
    const transformedActivities = exploreActivities.map((activity: any) => ({
      id: activity.id,
      title: activity.title,
      category: activity.category,
      duration: activity.duration, // already in minutes
      color: activity.color || getDefaultIconColor(activity.category),
      icon: activity.icon || getDefaultIcon(activity.category),
      rating: activity.rating,
      description: activity.description,
      tags: activity.tags || [],
      difficulty: activity.difficulty || 'Medium',
      energy_level: activity.energy_level || 'Medium'
    }));

    return c.json(transformedActivities);
  } catch (error) {
    console.log("Error fetching explore activities:", error);
    // Return default activities on error
    return c.json(getDefaultExploreActivities());
  }
});

// Suggestions endpoint for home screen (combines explore data with user tasks)
app.get("/make-server-966d4846/suggestions", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    // Get explore activities (activity suggestions)
    const { data: exploreActivities, error: exploreError } = await supabase
      .from('explore')
      .select('*')
      .eq('user_id', user.id)
      .limit(20); // Limit for performance

    let activitiesData = exploreActivities;
    
    if (exploreError || !exploreActivities || exploreActivities.length === 0) {
      console.log("Using default explore activities for suggestions");
      activitiesData = getDefaultExploreActivities();
    }

    // Transform explore activities to suggestion format
    const suggestions = (activitiesData || []).map((activity: any) => ({
      id: activity.id,
      title: activity.title,
      category: activity.category,
      duration: activity.duration,
      color: activity.color || `bg-${activity.category.toLowerCase()}-500`,
      icon: activity.icon || getDefaultIcon(activity.category),
      rating: activity.rating,
      type: 'suggestion'
    }));

    // Filter suggestions that are suitable for short time slots (like 10 minutes)
    const shortSuggestions = suggestions.filter(s => s.duration <= 15);

    return c.json(shortSuggestions.slice(0, 8)); // Return top 8 suggestions
  } catch (error) {
    console.log("Error fetching suggestions:", error);
    // Return default suggestions on error
    const defaultSuggestions = getDefaultExploreActivities()
      .filter(s => s.duration <= 15)
      .map(activity => ({
        ...activity,
        type: 'suggestion'
      }));
    return c.json(defaultSuggestions);
  }
});

// Discover endpoint (alias for explore for backward compatibility)
app.get("/make-server-966d4846/discover", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();

    const { data: exploreActivities, error: exploreError } = await supabase
      .from('explore')
      .select('*')
      .eq('user_id', user.id)
      .order('title', { ascending: true });

    let activitiesData = exploreActivities;
    
    if (exploreError || !exploreActivities || exploreActivities.length === 0) {
      console.log("Using default explore activities for discover");
      activitiesData = getDefaultExploreActivities();
    }

    // Group activities by category for the discover/activities tab
    const categorizedActivities = {};
    (activitiesData || []).forEach((activity: any) => {
      const category = activity.category || 'Other';
      if (!categorizedActivities[category]) {
        categorizedActivities[category] = [];
      }
      categorizedActivities[category].push({
        id: activity.id,
        title: activity.title,
        category: activity.category,
        duration: activity.duration,
        color: activity.color || getDefaultIconColor(activity.category),
        icon: activity.icon || getDefaultIcon(activity.category),
        rating: activity.rating,
        description: activity.description,
        tags: activity.tags || [],
        difficulty: activity.difficulty || 'Medium',
        energy_level: activity.energy_level || 'Medium'
      });
    });

    // Return in the format expected by the Activities/Discover tab
    return c.json({
      allActivities: activitiesData || [],
      categorizedActivities
    });
  } catch (error) {
    console.log("Error fetching discover activities:", error);
    // Return default data on error
    const defaultData = getDefaultExploreActivities();
    const defaultCategorized = {};
    defaultData.forEach((activity: any) => {
      const category = activity.category || 'Other';
      if (!defaultCategorized[category]) {
        defaultCategorized[category] = [];
      }
      defaultCategorized[category].push(activity);
    });
    
    return c.json({ 
      allActivities: defaultData,
      categorizedActivities: defaultCategorized
    });
  }
});

// Working time change endpoint
app.post("/make-server-966d4846/gaps/update-working-time", async (c) => {
  try {
    const user = c.get('user');
    const supabase = createSupabaseClient();
    const body = await c.req.json();
    
    const { oldPreferences, newPreferences } = body;
    
    console.log('🔄 [Working Time Update] Request:', {
      userId: user.id,
      oldWorkStart: oldPreferences.calendar_work_start,
      oldWorkEnd: oldPreferences.calendar_work_end,
      newWorkStart: newPreferences.calendar_work_start,
      newWorkEnd: newPreferences.calendar_work_end
    });

    // Get all existing gaps for the user
    const { data: existingGaps, error: gapsError } = await supabase
      .from('gaps')
      .select('*')
      .eq('user_id', user.id);

    if (gapsError) {
      console.log('❌ [Working Time Update] Error fetching gaps:', gapsError);
      return c.json({ error: "Failed to fetch existing gaps" }, 500);
    }

    // Process the working time change using local logic
    const { gapsToCreate, gapsToDelete, gapsToUpdate } = handleWorkingTimeChange(
      existingGaps || [],
      oldPreferences,
      newPreferences,
      user.id
    );

    console.log('📊 [Working Time Update] Changes:', {
      gapsToCreate: gapsToCreate.length,
      gapsToDelete: gapsToDelete.length,
      gapsToUpdate: gapsToUpdate.length
    });

    // Execute changes in a transaction
    let created = 0;
    let deleted = 0;
    let updated = 0;

    // Delete gaps that are no longer valid
    if (gapsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('gaps')
        .delete()
        .in('id', gapsToDelete);

      if (deleteError) {
        console.log('❌ [Working Time Update] Error deleting gaps:', deleteError);
        return c.json({ error: "Failed to delete invalid gaps" }, 500);
      }
      deleted = gapsToDelete.length;
    }

    // Update existing gaps that need adjustment
    if (gapsToUpdate.length > 0) {
      for (const gap of gapsToUpdate) {
        const { error: updateError } = await supabase
          .from('gaps')
          .update({
            start_time: gap.start_time,
            end_time: gap.end_time,
            duration_minutes: gap.duration_minutes,
            updated_at: gap.updated_at,
            modified_by: gap.modified_by
          })
          .eq('id', gap.id);

        if (updateError) {
          console.log('❌ [Working Time Update] Error updating gap:', updateError);
          continue;
        }
        updated++;
      }
    }

    // Create new gaps for extended working hours
    if (gapsToCreate.length > 0) {
      const { error: createError } = await supabase
        .from('gaps')
        .insert(gapsToCreate);

      if (createError) {
        console.log('❌ [Working Time Update] Error creating gaps:', createError);
        return c.json({ error: "Failed to create new gaps" }, 500);
      }
      created = gapsToCreate.length;
    }

    console.log('✅ [Working Time Update] Success:', {
      created,
      deleted,
      updated
    });

    return c.json({ 
      success: true, 
      created,
      deleted,
      updated
    });

  } catch (error) {
    console.log('❌ [Working Time Update] Unexpected error:', error);
    return c.json({ error: "Failed to update working time" }, 500);
  }
});

// Working time change logic (local implementation)
function handleWorkingTimeChange(
  existingGaps: any[],
  oldPreferences: any,
  newPreferences: any,
  userId: string
): { gapsToCreate: any[], gapsToDelete: string[], gapsToUpdate: any[] } {
  const gapsToCreate: any[] = [];
  const gapsToDelete: string[] = [];
  const gapsToUpdate: any[] = [];

  // Group gaps by date for easier processing
  const gapsByDate = new Map();
  existingGaps.forEach(gap => {
    if (!gapsByDate.has(gap.date)) {
      gapsByDate.set(gap.date, []);
    }
    gapsByDate.get(gap.date).push(gap);
  });

  // Process each date
  for (const [date, gaps] of gapsByDate) {
    const dayOfWeek = new Date(date).getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[dayOfWeek];

    // Check if this day is still a working day
    const oldWorkingDays = normalizeWorkingDays(oldPreferences.calendar_working_days);
    const newWorkingDays = normalizeWorkingDays(newPreferences.calendar_working_days);
    
    const wasWorkingDay = oldWorkingDays.includes(currentDay);
    const isWorkingDay = newWorkingDays.includes(currentDay);

    if (!isWorkingDay && wasWorkingDay) {
      // Day is no longer a working day - delete all gaps
      gaps.forEach(gap => gapsToDelete.push(gap.id));
      continue;
    }

    if (isWorkingDay && !wasWorkingDay) {
      // Day is now a working day - create new gaps
      const newGaps = createFreeHourGaps(date, newPreferences, userId);
      gapsToCreate.push(...newGaps);
      continue;
    }

    if (!isWorkingDay) {
      // Not a working day in either case - skip
      continue;
    }

    // Day is still a working day - check for time changes
    const oldWorkStart = timeToMinutes(oldPreferences.calendar_work_start);
    const oldWorkEnd = timeToMinutes(oldPreferences.calendar_work_end);
    const newWorkStart = timeToMinutes(newPreferences.calendar_work_start);
    const newWorkEnd = timeToMinutes(newPreferences.calendar_work_end);

    // Process each gap on this date
    gaps.forEach(gap => {
      const gapStart = timeToMinutes(gap.start_time);
      const gapEnd = timeToMinutes(gap.end_time);

      // Check if gap is completely outside new working hours
      if (gapEnd <= newWorkStart || gapStart >= newWorkEnd) {
        gapsToDelete.push(gap.id);
        return;
      }

      // Check if gap needs to be updated (partially outside or needs adjustment)
      let needsUpdate = false;
      let newStartTime = gap.start_time;
      let newEndTime = gap.end_time;

      // Adjust start time if gap starts before new work start
      if (gapStart < newWorkStart) {
        newStartTime = minutesToTime(newWorkStart);
        needsUpdate = true;
      }

      // Adjust end time if gap ends after new work end
      if (gapEnd > newWorkEnd) {
        newEndTime = minutesToTime(newWorkEnd);
        needsUpdate = true;
      }

      if (needsUpdate) {
        const newDuration = timeToMinutes(newEndTime) - timeToMinutes(newStartTime);
        
        // Only update if the gap still has meaningful duration
        if (newDuration >= (newPreferences.calendar_min_gap || 15)) {
          gapsToUpdate.push({
            ...gap,
            start_time: newStartTime,
            end_time: newEndTime,
            duration_minutes: newDuration,
            updated_at: new Date().toISOString(),
            modified_by: 'system'
          });
        } else {
          // Gap is too small after adjustment - delete it
          gapsToDelete.push(gap.id);
        }
      }
    });

    // Create new gaps for extended working hours
    if (newWorkStart < oldWorkStart) {
      // Work starts earlier - create gaps for the new early period
      const earlyGaps = createGapsForTimeRange(
        date,
        newWorkStart,
        oldWorkStart,
        newPreferences,
        userId
      );
      gapsToCreate.push(...earlyGaps);
    }

    if (newWorkEnd > oldWorkEnd) {
      // Work ends later - create gaps for the new late period
      const lateGaps = createGapsForTimeRange(
        date,
        oldWorkEnd,
        newWorkEnd,
        newPreferences,
        userId
      );
      gapsToCreate.push(...lateGaps);
    }
  }

  return { gapsToCreate, gapsToDelete, gapsToUpdate };
}

// Helper function to create gaps for a specific time range
function createGapsForTimeRange(
  date: string,
  startMinutes: number,
  endMinutes: number,
  preferences: any,
  userId: string
): any[] {
  const gaps: any[] = [];
  const minGapDuration = preferences.calendar_min_gap || 15;

  // Create one gap per hour in the specified range
  for (let hour = startMinutes; hour < endMinutes; hour += 60) {
    const gapStart = minutesToTime(hour);
    const gapEnd = minutesToTime(Math.min(hour + 60, endMinutes));
    const gapDuration = Math.min(60, endMinutes - hour);

    // Only create gap if it meets minimum duration requirement
    if (gapDuration >= minGapDuration) {
      gaps.push({
        id: generateUUID(),
        user_id: userId,
        date,
        start_time: gapStart,
        end_time: gapEnd,
        duration_minutes: gapDuration,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'system'
      });
    }
  }

  return gaps;
}

// Helper function to normalize working days
function normalizeWorkingDays(workingDays: any): string[] {
  // If it's already an array, return it
  if (Array.isArray(workingDays)) {
    return workingDays;
  }
  
  // If it's an object, convert to array
  if (workingDays && typeof workingDays === 'object') {
    // First try: get keys where value is true
    let result = Object.keys(workingDays).filter(day => workingDays[day] === true);
    
    // If empty, try truthy values
    if (result.length === 0) {
      result = Object.keys(workingDays).filter(day => workingDays[day]);
    }
    
    // If still empty, try day name mapping
    if (result.length === 0) {
      const dayMapping = {
        'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
        'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday', 'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday'
      };
      
      result = Object.keys(workingDays).map(key => dayMapping[key.toLowerCase()]).filter(Boolean);
    }
    
    // Final fallback: default working days
    if (result.length === 0) {
      result = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    }
    
    return result;
  }
  
  // If it's null/undefined/other, return defaults
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
}

// Helper function to create free hour gaps
function createFreeHourGaps(date: string, preferences: any, userId: string): any[] {
  const dayOfWeek = new Date(date).getDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = dayNames[dayOfWeek];
  
  // Check if this day is in working days
  const workingDaysArray = normalizeWorkingDays(preferences.calendar_working_days);
  if (!workingDaysArray.includes(currentDay)) {
    return [];
  }
  
  // Skip weekends if not included
  if (!preferences.calendar_include_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return [];
  }
  
  const gaps: any[] = [];
  const workStart = timeToMinutes(preferences.calendar_work_start);
  const workEnd = timeToMinutes(preferences.calendar_work_end);
  
  // Create one gap per hour
  for (let hour = workStart; hour < workEnd; hour += 60) {
    const startTime = minutesToTime(hour);
    const endTime = minutesToTime(Math.min(hour + 60, workEnd));
    
    gaps.push({
      id: generateUUID(),
      user_id: userId,
      date,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: Math.min(60, workEnd - hour),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modified_by: 'system'
    });
  }
  
  return gaps;
}

// Start the server
Deno.serve(app.fetch);