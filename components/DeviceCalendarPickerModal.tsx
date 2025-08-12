import { useState, useEffect } from 'react';
import { X, Calendar, Check, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { getDeviceCalendars, isDeviceCalendarAvailable } from '../utils/calendarSource.ios';
import { BridgeCalendar } from '../native/CalendarBridge';

interface DeviceCalendarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCalendarIds: string[];
  onSave: (calendarIds: string[]) => void;
}

export function DeviceCalendarPickerModal({
  isOpen,
  onClose,
  selectedCalendarIds,
  onSave
}: DeviceCalendarPickerModalProps) {
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedCalendarIds);
  const [calendars, setCalendars] = useState<BridgeCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCalendars();
    }
  }, [isOpen]);

  const loadCalendars = async () => {
    setIsLoading(true);
    try {
      const permission = await isDeviceCalendarAvailable();
      setHasPermission(permission);
      
      if (permission) {
        const calendarList = await getDeviceCalendars();
        setCalendars(calendarList);
      }
    } catch (error) {
      console.error('Failed to load calendars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalendarToggle = (calendarId: string, checked: boolean) => {
    if (checked) {
      setLocalSelectedIds(prev => [...prev, calendarId]);
    } else {
      setLocalSelectedIds(prev => prev.filter(id => id !== calendarId));
    }
  };

  const handleSave = () => {
    onSave(localSelectedIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Choose Calendars</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-2 hover:bg-slate-800/50"
          >
            <X className="w-4 h-4 text-slate-400" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-slate-400 text-sm">
            Select which device calendars to include in your planner. Only busy time will be shown.
          </p>

          {/* Real Calendar List */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
                <Calendar className="w-4 h-4 text-slate-400 animate-spin" />
                <span className="text-sm text-slate-400">Loading calendars...</span>
              </div>
            </div>
          ) : !hasPermission ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-900/20 rounded-lg border border-red-700/30">
                <Settings className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300">Calendar permission required</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Please enable calendar access in iOS Settings to select calendars.
              </p>
            </div>
          ) : calendars.length === 0 ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400">No calendars found</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: calendar.colorHex || '#007AFF' }}
                    />
                    <div>
                      <Label className="text-sm font-medium text-slate-300">{calendar.title}</Label>
                      <p className="text-xs text-slate-500">
                        {calendar.isSubscribed ? 'Subscribed' : 'Local'} • {calendar.allowsModifications ? 'Editable' : 'Read-only'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={localSelectedIds.includes(calendar.id)}
                    onCheckedChange={(checked) => handleCalendarToggle(calendar.id, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-700/50">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 bg-slate-800/50 border-slate-700 hover:bg-slate-700/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            <Check className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
