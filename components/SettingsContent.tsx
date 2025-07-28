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
import { CalendarSync } from './CalendarSync';
import { DebugPanel } from './DebugPanel';
import { WorkingDaysSelector } from './WorkingDaysSelector';
import { ToggleGroup } from './ToggleGroup';
import { WidgetShare } from './WidgetShare';
import { toast } from 'sonner@2.0.3';

interface SettingsContentProps {
  user: any;
  preferences: UserPreferences;
  onSignOut: () => void;
  onPreferencesUpdate?: (preferences: UserPreferences) => void;
}

export function SettingsContent({ user, preferences, onSignOut, onPreferencesUpdate }: SettingsContentProps) {
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(preferences);
  const [editingProfile, setEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
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

  // Update local preferences when props change
  useEffect(() => {
    setLocalPreferences(preferences);
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
    }
  ];

  const updatePreference = (key: string, value: any) => {
    setLocalPreferences(prev => ({ ...prev, [key]: value }));
  };

  const savePreferences = async () => {
    setIsSaving(true);
    try {
      await preferencesAPI.save(localPreferences);
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