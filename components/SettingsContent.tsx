import { useState, useEffect } from 'react';
import { 
  LogOut, User, Bell, Calendar, Palette, Shield, 
  Clock, Edit3, Check, X, ChevronRight, Save,
  Phone, Globe, Timer, Volume2, Vibrate,
  Moon, Sun, Zap, BookOpen, Target, Settings as SettingsIcon,
  ArrowLeft
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { Slider } from './ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { UserPreferences } from '../types/index';
import { preferencesAPI, profileAPI } from '../utils/api';
import { EnhancedStorageManager } from '../utils/storage/EnhancedStorageManager';
import { CalendarSync } from './CalendarSync';
import { DebugPanel } from './DebugPanel';
import { WorkingDaysSelector } from './WorkingDaysSelector';
import { ToggleGroup } from './ToggleGroup';
import { WidgetShare } from './WidgetShare';
import { toast } from 'sonner';

interface SettingsContentProps {
  user: any;
  preferences: UserPreferences;
  onSignOut: () => void;
  onPreferencesUpdate?: (preferences: UserPreferences) => void;
  localFirstService?: EnhancedStorageManager | null;
}

export function SettingsContent({ user, preferences, onSignOut, onPreferencesUpdate, localFirstService }: SettingsContentProps) {
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(preferences);
  const [editingProfile, setEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [cacheHealthData, setCacheHealthData] = useState<any>(null);
  const [showCacheHealth, setShowCacheHealth] = useState(false);
  const [energyMetrics, setEnergyMetrics] = useState<any>(null);
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileEdits, setProfileEdits] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_country_code: '+1',
    phone_number: '',
    timezone: 'America/New_York'
  });

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await profileAPI.get();
        setUserProfile(profile);
        if (profile) {
          setProfileEdits({
            first_name: profile.first_name || '',
            last_name: profile.last_name || '',
            email: profile.email || '',
            phone_country_code: profile.phone_country_code || '+1',
            phone_number: profile.phone_number || '',
            timezone: profile.timezone || 'America/New_York'
          });
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, []);

  // Load cache health data
  const loadCacheHealth = async () => {
    if (!localFirstService) return;
    
    try {
      const healthReport = localFirstService.getCacheHealthReport();
      setCacheHealthData(healthReport);
      
      // Calculate energy metrics
      const calculateEnergyMetrics = async () => {
        const metrics: any = {};
        
        // Get battery level if available
        if ('getBattery' in navigator && typeof navigator.getBattery === 'function') {
          try {
            const battery = await (navigator as any).getBattery();
            metrics.batteryLevel = Math.round(battery.level * 100);
          } catch (error) {
            metrics.batteryLevel = null;
          }
        }
        
        // Get memory usage if available
        if ('memory' in performance) {
          metrics.memoryUsage = Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024); // MB
        }
        
        // Calculate cache efficiency
        const hitRate = healthReport?.memoryCache?.hitRate || 0;
        metrics.cacheEfficiency = Math.round(hitRate * 100);
        
        // Calculate estimated energy savings
        const estimatedSavings = hitRate * 0.3; // 30% max savings
        metrics.energySavings = Math.round(estimatedSavings * 100);
        
        setEnergyMetrics(metrics);
      };
      
      calculateEnergyMetrics();
    } catch (error) {
      console.error('Error loading cache health:', error);
    }
  };

  // Update local preferences when props change
  useEffect(() => {
    // Ensure array fields are properly initialized
    const safePreferences = {
      ...preferences,
      calendar_working_days: Array.isArray(preferences.calendar_working_days) 
        ? preferences.calendar_working_days 
        : [],
      preferred_categories: Array.isArray(preferences.preferred_categories) 
        ? preferences.preferred_categories 
        : []
    };
    setLocalPreferences(safePreferences);
  }, [preferences]);

  // Simplified settings categories with better grouping
  const settingsItems = [
    {
      id: 'profile',
      icon: User,
      title: 'Profile',
      description: 'Account & personal info',
    },
    {
      id: 'schedule',
      icon: Calendar,
      title: 'Schedule',
      description: 'Work hours & calendar sync',
    },
    {
      id: 'activities',
      icon: Target,
      title: 'Activities',
      description: 'Timer & activity preferences',
    },
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notifications',
      description: 'Alerts & reminders',
    },
    {
      id: 'preferences',
      icon: SettingsIcon,
      title: 'Preferences',
      description: 'Theme & advanced options',
    },
    {
      id: 'cache',
      icon: Zap,
      title: 'Cache Health',
      description: 'Performance & storage monitoring',
    }
  ];

  const updatePreference = (key: string, value: any) => {
    setLocalPreferences(prev => ({ ...prev, [key]: value }));
  };

  const savePreferences = async () => {
    setIsSaving(true);
    try {
      // Save to local storage first
      if (localFirstService) {
        console.log('💾 Saving preferences to local storage...');
        await localFirstService.savePreferences(localPreferences);
        console.log('✅ Preferences saved to local storage');
      }

      // Then sync to remote API
      try {
        console.log('🌐 Syncing preferences to remote API...');
        await preferencesAPI.save(localPreferences);
        console.log('✅ Preferences synced to remote API');
      } catch (apiError) {
        console.error('⚠️ Failed to sync to remote API, but local save succeeded:', apiError);
        // Don't show error to user since local save worked
      }

      onPreferencesUpdate?.(localPreferences);
      toast.success('Settings saved');
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      await profileAPI.save(profileEdits);
      setUserProfile({ ...userProfile, ...profileEdits });
      setEditingProfile(false);
      toast.success('Profile updated');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelProfileEdit = () => {
    if (userProfile) {
      setProfileEdits({
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        email: userProfile.email || '',
        phone_country_code: userProfile.phone_country_code || '+1',
        phone_number: userProfile.phone_number || '',
        timezone: userProfile.timezone || 'America/New_York'
      });
    }
    setEditingProfile(false);
  };

  // Simplified setting row component
  const SettingRow = ({ icon: Icon, label, description, value, onChange, type = 'switch' }: any) => (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 flex-1">
        <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-white text-sm font-medium">{label}</div>
          {description && <div className="text-slate-400 text-xs">{description}</div>}
        </div>
      </div>
      {type === 'switch' && (
        <Switch checked={value} onCheckedChange={onChange} />
      )}
      {type === 'select' && value}
    </div>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Profile Information</h3>
              {!editingProfile ? (
                <Button variant="ghost" size="sm" onClick={() => setEditingProfile(true)}>
                  <Edit3 className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelProfileEdit}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={saveProfile} disabled={isSaving}>
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-slate-400">First Name</Label>
                  <Input
                    value={editingProfile ? profileEdits.first_name : (userProfile?.first_name || '')}
                    onChange={(e) => setProfileEdits(prev => ({ ...prev, first_name: e.target.value }))}
                    disabled={!editingProfile}
                    className="mt-1 bg-slate-800/50 border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Last Name</Label>
                  <Input
                    value={editingProfile ? profileEdits.last_name : (userProfile?.last_name || '')}
                    onChange={(e) => setProfileEdits(prev => ({ ...prev, last_name: e.target.value }))}
                    disabled={!editingProfile}
                    className="mt-1 bg-slate-800/50 border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm text-slate-400">Email</Label>
                <Input
                  type="email"
                  value={editingProfile ? profileEdits.email : (userProfile?.email || '')}
                  onChange={(e) => setProfileEdits(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!editingProfile}
                  className="mt-1 bg-slate-800/50 border-slate-700 text-sm"
                />
              </div>

              <div>
                <Label className="text-sm text-slate-400">Timezone</Label>
                <Select
                  value={editingProfile ? profileEdits.timezone : (userProfile?.timezone || 'America/New_York')}
                  onValueChange={(value) => setProfileEdits(prev => ({ ...prev, timezone: value }))}
                  disabled={!editingProfile}
                >
                  <SelectTrigger className="mt-1 bg-slate-800/50 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="Europe/London">GMT</SelectItem>
                    <SelectItem value="Europe/Berlin">CET</SelectItem>
                    <SelectItem value="Asia/Tokyo">JST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Schedule Settings</h3>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-slate-400">Google Calendar</Label>
                <div className="mt-2">
                  <CalendarSync onStatusChange={() => {}} />
                </div>
              </div>

              <div>
                <Label className="text-sm text-slate-400">Work Hours</Label>
                <div className="flex gap-3 mt-2">
                  <Input
                    type="time"
                    value={localPreferences.calendar_work_start}
                    onChange={(e) => updatePreference('calendar_work_start', e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-sm"
                  />
                  <Input
                    type="time"
                    value={localPreferences.calendar_work_end}
                    onChange={(e) => updatePreference('calendar_work_end', e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <WorkingDaysSelector
                  selectedDays={localPreferences.calendar_working_days}
                  onChange={(days) => updatePreference('calendar_working_days', days)}
                />
              </div>

              <SettingRow
                icon={Calendar}
                label="Include Weekends"
                description="Show gaps on weekends"
                value={localPreferences.calendar_include_weekends}
                onChange={(checked: boolean) => updatePreference('calendar_include_weekends', checked)}
              />
            </div>

            <Button onClick={savePreferences} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        );

      case 'activities':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Activity Settings</h3>
            
            <div className="space-y-1">
              <SettingRow
                icon={Timer}
                label="Auto-start Timer"
                description="Start timer automatically"
                value={localPreferences.autostart}
                onChange={(checked: boolean) => updatePreference('autostart', checked)}
              />

              <SettingRow
                icon={Clock}
                label="Show Timer"
                description="Display timer interface"
                value={localPreferences.show_timer}
                onChange={(checked: boolean) => updatePreference('show_timer', checked)}
              />

              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-4 h-4 text-slate-400" />
                  <div>
                    <Label className="text-sm font-medium">Default Energy Level</Label>
                  </div>
                </div>
                <Select
                  value={localPreferences.default_energy_level}
                  onValueChange={(value) => updatePreference('default_energy_level', value)}
                >
                  <SelectTrigger className="bg-slate-800/50 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low Energy</SelectItem>
                    <SelectItem value="Medium">Medium Energy</SelectItem>
                    <SelectItem value="High">High Energy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="py-3">
                <ToggleGroup
                  title="Preferred Categories"
                  icon={BookOpen}
                  options={['Personal', 'Work', 'Health', 'Learning', 'Creative', 'Social']}
                  selectedOptions={localPreferences.preferred_categories}
                  onChange={(categories) => updatePreference('preferred_categories', categories)}
                  columns={3}
                />
              </div>
            </div>

            <Button onClick={savePreferences} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Notifications</h3>
            
            <div className="space-y-1">
              <SettingRow
                icon={Bell}
                label="Daily Reminders"
                description="Get daily task reminders"
                value={localPreferences.daily_reminder}
                onChange={(checked: boolean) => updatePreference('daily_reminder', checked)}
              />

              <SettingRow
                icon={Clock}
                label="Activity Reminders"
                description="Notifications for upcoming activities"
                value={localPreferences.notification_activity_reminders}
                onChange={(checked: boolean) => updatePreference('notification_activity_reminders', checked)}
              />

              <SettingRow
                icon={Calendar}
                label="Gap Notifications"
                description="Alerts for upcoming free time"
                value={localPreferences.notification_upcoming_gaps}
                onChange={(checked: boolean) => updatePreference('notification_upcoming_gaps', checked)}
              />

              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Timer className="w-4 h-4 text-slate-400" />
                  <div>
                    <Label className="text-sm font-medium">Lead Time</Label>
                    <div className="text-xs text-slate-400">{localPreferences.notification_lead_time} minutes before</div>
                  </div>
                </div>
                <Slider
                  value={[localPreferences.notification_lead_time]}
                  onValueChange={([value]) => updatePreference('notification_lead_time', value)}
                  max={30}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Moon className="w-4 h-4 text-slate-400" />
                  <Label className="text-sm font-medium">Quiet Hours</Label>
                </div>
                <div className="flex gap-3">
                  <Input
                    type="time"
                    value={localPreferences.quiet_hours_start}
                    onChange={(e) => updatePreference('quiet_hours_start', e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-sm"
                  />
                  <Input
                    type="time"
                    value={localPreferences.quiet_hours_end}
                    onChange={(e) => updatePreference('quiet_hours_end', e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-sm"
                  />
                </div>
              </div>
            </div>

            <Button onClick={savePreferences} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        );

      case 'preferences':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Preferences</h3>
            
            <div className="space-y-1">
              <SettingRow
                icon={localPreferences.dark_mode ? Moon : Sun}
                label="Dark Mode"
                description="Use dark theme"
                value={localPreferences.dark_mode}
                onChange={(checked: boolean) => updatePreference('dark_mode', checked)}
              />

              <SettingRow
                icon={Volume2}
                label="Sound Effects"
                description="Play sound notifications"
                value={localPreferences.sound_enabled}
                onChange={(checked: boolean) => updatePreference('sound_enabled', checked)}
              />

              <SettingRow
                icon={Vibrate}
                label="Vibration"
                description="Vibrate for notifications"
                value={localPreferences.vibration_enabled}
                onChange={(checked: boolean) => updatePreference('vibration_enabled', checked)}
              />

              <SettingRow
                icon={Zap}
                label="Smart Learning"
                description="AI-powered suggestions"
                value={localPreferences.learning_enabled}
                onChange={(checked: boolean) => updatePreference('learning_enabled', checked)}
              />

              <SettingRow
                icon={Target}
                label="Habit Tracking"
                description="Track activity patterns"
                value={localPreferences.habit_tracking_enabled}
                onChange={(checked: boolean) => updatePreference('habit_tracking_enabled', checked)}
              />
            </div>

            <div className="border-t border-slate-700/50 pt-6">
              <WidgetShare />
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-700/50 pt-3 mt-6">
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span className="text-sm">Developer Options</span>
                </button>
                
                {showDebugPanel && (
                  <div className="mt-3 p-3 bg-slate-800/30 rounded-lg">
                    <DebugPanel embedded={true} />
                  </div>
                )}
              </div>
            </div>

            <Button onClick={savePreferences} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        );

      case 'cache':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Cache Health</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadCacheHealth}
                disabled={!localFirstService}
              >
                <Zap className="w-4 h-4" />
                Refresh
              </Button>
            </div>

            {cacheHealthData ? (
              <div className="space-y-4">
                {/* Energy Metrics */}
                {energyMetrics && (
                  <div className="p-4 bg-green-900/20 rounded-lg border border-green-700/30">
                    <h4 className="text-sm font-medium text-green-400 mb-3">🔋 Energy Impact</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {energyMetrics.batteryLevel !== null && (
                        <div>
                          <span className="text-green-400">Battery Level:</span>
                          <span className="ml-2 text-white">
                            {energyMetrics.batteryLevel}%
                          </span>
                        </div>
                      )}
                      {energyMetrics.memoryUsage && (
                        <div>
                          <span className="text-green-400">Memory Usage:</span>
                          <span className="ml-2 text-white">
                            {energyMetrics.memoryUsage}MB
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-green-400">Cache Efficiency:</span>
                        <span className="ml-2 text-white">
                          {energyMetrics.cacheEfficiency}%
                        </span>
                      </div>
                      <div>
                        <span className="text-green-400">Energy Savings:</span>
                        <span className="ml-2 text-white">
                          {energyMetrics.energySavings}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Memory Cache Stats */}
                {cacheHealthData.memoryCache && (
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <h4 className="text-sm font-medium text-slate-300 mb-3">Memory Cache</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Hit Rate:</span>
                        <span className="ml-2 text-white">
                          {(cacheHealthData.memoryCache.hitRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Size:</span>
                        <span className="ml-2 text-white">
                          {cacheHealthData.memoryCache.size} items
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Hits:</span>
                        <span className="ml-2 text-white">
                          {cacheHealthData.memoryCache.hits}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Misses:</span>
                        <span className="ml-2 text-white">
                          {cacheHealthData.memoryCache.misses}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Limit Violations */}
                {cacheHealthData.limitViolations && cacheHealthData.limitViolations.length > 0 && (
                  <div className="p-4 bg-red-900/20 rounded-lg border border-red-700/30">
                    <h4 className="text-sm font-medium text-red-400 mb-3">⚠️ Storage Limits</h4>
                    <div className="space-y-2">
                      {cacheHealthData.limitViolations.map((violation: any, index: number) => (
                        <div key={index} className="text-sm">
                          <span className="text-red-400">{violation.type}:</span>
                          <span className="ml-2 text-white">
                            {violation.current} / {violation.limit} ({violation.percentage.toFixed(1)}%)
                          </span>
                          <div className="text-xs text-red-400/70 mt-1">
                            {violation.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Predictive Analytics */}
                {cacheHealthData.predictiveAnalytics && (
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <h4 className="text-sm font-medium text-slate-300 mb-3">Predictive Cache</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Total Accesses:</span>
                        <span className="ml-2 text-white">
                          {cacheHealthData.predictiveAnalytics.totalAccesses}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Frequently Accessed:</span>
                        <span className="ml-2 text-white">
                          {cacheHealthData.predictiveAnalytics.frequentlyAccessed?.length || 0} items
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {cacheHealthData.recommendations && cacheHealthData.recommendations.length > 0 && (
                  <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-700/30">
                    <h4 className="text-sm font-medium text-blue-400 mb-3">💡 Recommendations</h4>
                    <div className="space-y-2">
                      {cacheHealthData.recommendations.map((rec: string, index: number) => (
                        <div key={index} className="text-sm text-blue-300">
                          • {rec}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Zap className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-400">Click "Refresh" to load cache health data</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (activeSection) {
    return (
      <div className="p-6 space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveSection(null)}
            className="p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-medium text-white">Settings</h2>
          </div>
        </div>

        {/* Section content */}
        <div className="max-w-md mx-auto">
          {renderSectionContent()}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-medium text-white">Settings</h2>
        <p className="text-slate-400 text-sm">Manage your preferences</p>
      </div>

      {/* Settings grid */}
      <div className="space-y-3 max-w-md mx-auto">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center">
                <Icon className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-medium">{item.title}</div>
                <div className="text-slate-400 text-sm">{item.description}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          );
        })}

        {/* Sign out button */}
        <AlertDialog open={isSignOutDialogOpen} onOpenChange={setIsSignOutDialogOpen}>
          <AlertDialogTrigger asChild>
            <button className="w-full flex items-center gap-4 p-4 bg-red-900/20 rounded-2xl border border-red-700/30 hover:bg-red-900/30 transition-colors mt-6">
              <div className="w-10 h-10 rounded-full bg-red-700/30 flex items-center justify-center">
                <LogOut className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-red-400 font-medium">Sign Out</div>
                <div className="text-red-400/70 text-sm">Log out of your account</div>
              </div>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-900 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Sign Out</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to sign out? You'll need to sign in again to access your data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={onSignOut}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}