import { useState } from 'react';
import { X, Calendar, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';

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

          {/* Placeholder Calendar List */}
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">All calendars</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Real calendar list will appear after native integration.
            </p>
          </div>
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
