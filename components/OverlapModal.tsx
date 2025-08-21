import { X, Clock, Play, Calendar } from 'lucide-react';
import { Task, UserPreferences } from '../types/index';
import { renderSafeIcon } from '../utils/helpers';
import { format } from 'date-fns';

interface OverlapModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  calendarEvents: Array<{ id: string; start: Date; end: Date; title: string; isAllDay: boolean }>;
  timeSlot: string;
  onActivitySelect: (activity: Task) => void;
  onStartTimer: (activity: Task) => void;
  userPreferences?: UserPreferences;
}

export function OverlapModal({
  isOpen,
  onClose,
  tasks,
  calendarEvents,
  timeSlot,
  onActivitySelect,
  onStartTimer,
  userPreferences
}: OverlapModalProps) {
  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-end pb-safe">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full bg-slate-900/95 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 max-h-[95vh] min-h-[50vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-slate-600 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div>
            <h3 className="text-xl text-white">
              Overlapping Events & Activities
            </h3>
            <p className="text-slate-400 text-sm">
              {calendarEvents.length} calendar events, {tasks.length} tasks • {timeSlot}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 px-6 pb-8 space-y-4 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(95vh - 120px)' }}>
          {/* Calendar Events */}
          {calendarEvents.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Calendar Events</h4>
              {calendarEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-red-800/40 backdrop-blur-sm rounded-2xl p-4 border border-red-500/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium text-lg mb-1">
                        {userPreferences?.show_device_calendar_titles ? (event.title || 'Busy') : 'Busy'}
                      </div>
                      <div className="text-slate-400 text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>
                            {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
                          </span>
                          {event.isAllDay && (
                            <>
                              <span>•</span>
                              <span>All day</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Tasks</h4>
              {tasks
                .sort((a, b) => (a.dueTime || '').localeCompare(b.dueTime || ''))
                .map((activity) => {
                const totalDuration = parseInt(activity.duration.split(':')[1]) + (parseInt(activity.duration.split(':')[0]) * 60);
                const priorityColor = activity.priority === 'high' ? 'border-orange-500/30' : 
                                     activity.priority === 'medium' ? 'border-blue-500/30' : 'border-slate-500/30';
                
                return (
                  <div
                    key={activity.id}
                    className={`bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border ${priorityColor} relative overflow-hidden`}
                  >
                    {/* Priority indicator */}
                    {activity.priority === 'high' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                    )}
                    
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="relative flex-shrink-0">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              activity.iconColor === 'text-red-400' ? 'bg-red-500/20' :
                              activity.iconColor === 'text-blue-400' ? 'bg-blue-500/20' :
                              activity.iconColor === 'text-purple-400' ? 'bg-purple-500/20' :
                              activity.iconColor === 'text-green-400' ? 'bg-green-500/20' :
                              activity.iconColor === 'text-yellow-400' ? 'bg-yellow-500/20' :
                              activity.iconColor === 'text-orange-400' ? 'bg-orange-500/20' :
                              activity.iconColor === 'text-teal-400' ? 'bg-teal-500/20' :
                              activity.iconColor === 'text-pink-400' ? 'bg-pink-500/20' :
                              activity.iconColor === 'text-indigo-400' ? 'bg-indigo-500/20' :
                              'bg-slate-500/20'
                            }`}>
                              {renderSafeIcon(activity.icon)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium text-lg mb-1">{activity.title}</div>
                            <div className="text-slate-400 text-sm space-y-1">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span>{activity.dueTime}</span>
                                <span>•</span>
                                <span>{totalDuration} min</span>
                              </div>
                              {activity.priority && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">Priority:</span>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    activity.priority === 'high' ? 'text-orange-400 bg-orange-500/10' : 
                                    activity.priority === 'medium' ? 'text-blue-400 bg-blue-500/10' : 
                                    'text-slate-400 bg-slate-500/10'
                                  }`}>
                                    {activity.priority}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => onStartTimer(activity)}
                            className="w-10 h-10 rounded-full bg-green-500/20 hover:bg-green-500/30 flex items-center justify-center text-green-400 transition-colors"
                            title="Start Timer"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onActivitySelect(activity)}
                            className="px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-200 text-sm transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {activity.notes && (
                      <div className="mt-3 p-4 bg-slate-700/30 rounded-xl text-slate-300 text-sm leading-relaxed border border-slate-600/30">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Notes</div>
                        <div>{activity.notes}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
