import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Clock, Calendar, X } from 'lucide-react';
import { Task, TimeGap } from '../types/index';
import { useCalendarScheduling } from '../hooks/useCalendarScheduling';
import { Checkbox } from './ui/checkbox';

interface TimeSlotSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  gap: TimeGap;
  onScheduled: (scheduledTask: Task) => void;
}

export function TimeSlotSelectionModal({
  isOpen,
  onClose,
  task,
  gap,
  onScheduled
}: TimeSlotSelectionModalProps) {
  const [selectedTime, setSelectedTime] = useState<string>(gap.start_time);
  const [createCalendarEvent, setCreateCalendarEvent] = useState(false);
  const { scheduleTaskToGap, getAvailableTimeSlotsInGap, isScheduling } = useCalendarScheduling();

  const taskDuration = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
  const availableSlots = getAvailableTimeSlotsInGap(gap, taskDuration, 15);

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getEndTime = (startTime: string) => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + taskDuration;
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;
    return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
  };

  const handleSchedule = async () => {
    const result = await scheduleTaskToGap({
      task,
      gap,
      customTime: selectedTime,
      createCalendarEvent
    });

    if (result.success && result.scheduledTask) {
      onScheduled(result.scheduledTask);
      onClose();
    }
  };

  const formatGapDate = (date?: string) => {
    if (!date) return 'Today';
    
    const gapDate = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (gapDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (gapDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return gapDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white border-0 max-w-md mx-auto p-0 rounded-3xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Schedule Task
            </DialogTitle>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Task Info */}
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${task.iconColor}`}>
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-medium text-white">{task.title}</h3>
                <p className="text-slate-400 text-sm">{formatDuration(taskDuration)}</p>
              </div>
            </div>
          </div>

          {/* Gap Info */}
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <div>
                <h4 className="font-medium text-white">Available Time Slot</h4>
                <p className="text-slate-400 text-sm">
                  {formatGapDate(gap.date)} • {formatTime(gap.start_time)} - {formatTime(gap.end_time)}
                </p>
              </div>
            </div>
          </div>

          {/* Time Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Choose Start Time
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {availableSlots.map((timeSlot) => (
                <button
                  key={timeSlot}
                  onClick={() => setSelectedTime(timeSlot)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    selectedTime === timeSlot
                      ? 'border-blue-400 bg-blue-500/20 text-white'
                      : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{formatTime(timeSlot)}</div>
                  <div className="text-xs text-slate-400">
                    to {formatTime(getEndTime(timeSlot))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Calendar Event Option */}
          <div className="flex items-center gap-3 p-4 bg-slate-800/60 rounded-2xl border border-slate-700/50">
            <Checkbox
              id="create-calendar-event"
              checked={createCalendarEvent}
              onCheckedChange={(checked) => setCreateCalendarEvent(checked as boolean)}
            />
            <label htmlFor="create-calendar-event" className="flex-1 cursor-pointer">
              <div className="font-medium text-white">Create Google Calendar event</div>
              <div className="text-sm text-slate-400">
                Add this task to your Google Calendar
              </div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700/50 rounded-xl h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={isScheduling || !selectedTime}
              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl h-11 shadow-lg"
            >
              {isScheduling ? 'Scheduling...' : 'Schedule Task'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}