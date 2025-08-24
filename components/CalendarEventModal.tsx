import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Calendar, Clock, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface CalendarEvent {
  id: string;
  calendarId?: string;
  title: string;
  start: number; // timestamp in milliseconds
  end: number;   // timestamp in milliseconds
  isAllDay: boolean;
  // Basic event properties
  location?: string;
  notes?: string;
  url?: string;
  transparency?: 'opaque' | 'transparent';
  status?: 'none' | 'confirmed' | 'tentative' | 'cancelled';
}

interface CalendarEventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarEventModal({ event, isOpen, onClose }: CalendarEventModalProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isOpeningCalendar, setIsOpeningCalendar] = useState(false);

  if (!event) return null;

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)); // minutes
  
  // Handle minimal event data (like from busy overlays)
  const isMinimalEvent = !event.title || event.title === 'Busy';
  
  const formatTime = (date: Date) => {
    if (event.isAllDay) return 'All day';
    return format(date, 'h:mm a');
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours}h`;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Video conference functionality removed for now - simplified data structure

  const handleOpenInCalendar = async () => {
    try {
      setIsOpeningCalendar(true);
      console.log('Opening calendar event in device calendar:', event.id);
      
      // Import the CalendarBridge dynamically to avoid issues
      const { CalendarBridge } = await import('../src/plugins/calendar-bridge');
      
      if (CalendarBridge) {
        const result = await CalendarBridge.openEventInCalendar({ eventId: event.id });
        console.log('Calendar event opened successfully:', result);
        
        // Close the modal after opening the calendar
        setTimeout(() => {
          onClose();
        }, 500); // Small delay to ensure the calendar app opens
      } else {
        console.log('CalendarBridge not available, falling back to basic behavior');
        onClose();
      }
    } catch (error) {
      console.error('Error opening calendar event:', error);
      // Fallback: just close the modal
      onClose();
    } finally {
      setIsOpeningCalendar(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 rounded-2xl max-w-md w-full mx-4 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-white text-xl font-semibold flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-red-400" />
            </div>
            <span className="truncate flex-1 min-w-0">
              {isMinimalEvent ? 'Busy Time' : (event.title || 'Untitled Event')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Time & Duration */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-slate-300 min-w-0">
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {formatDate(startDate)}
                </div>
                <div className="text-sm text-slate-400 min-w-0">
                  <span className="truncate">{formatTime(startDate)} - {formatTime(endDate)}</span>
                  {!event.isAllDay && (
                    <span className="ml-2 text-slate-500 flex-shrink-0">
                      ({formatDuration(duration)})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>



          {/* Notes Preview */}
          {event.notes && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-300 min-w-0">
                <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="text-sm text-slate-400 flex-1 min-w-0">Notes</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto p-1 h-auto text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 flex-shrink-0"
                  onClick={() => setNotesExpanded(!notesExpanded)}
                >
                  {notesExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {notesExpanded && (
                <div className="ml-8 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
                  <p className="text-slate-300 text-sm whitespace-pre-wrap break-words">
                    {event.notes}
                  </p>
                </div>
              )}
              
              {!notesExpanded && (
                <div className="ml-8 overflow-hidden">
                  <p 
                    className="text-slate-400 text-sm break-words"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {event.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Info for minimal events */}
          {isMinimalEvent && (
            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
              <p className="text-slate-400 text-sm text-center break-words">
                This is a busy time block from your calendar.
              </p>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-3 text-slate-300 min-w-0">
              <div className="w-5 h-5 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 bg-slate-400 rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-400">Location</div>
                <div className="font-medium truncate">{event.location}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Button */}
        <div className="px-6 py-4 border-t border-slate-700/50">
          <Button
            onClick={handleOpenInCalendar}
            disabled={isOpeningCalendar}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl h-11 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOpeningCalendar ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Opening...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in Calendar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
