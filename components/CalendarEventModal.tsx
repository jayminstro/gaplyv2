import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Calendar, Clock, FileText, ChevronDown, ChevronUp, ExternalLink, MapPin, Link } from 'lucide-react';
import { format } from 'date-fns';
import { useIsMobile } from './ui/use-mobile';

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
  uid?: string; // Added for native event identifier
}

interface CalendarEventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarEventModal({ 
  event, 
  isOpen, 
  onClose 
}: CalendarEventModalProps) {
  const isMobile = useIsMobile();

  const isMinimalEvent = !event?.title || event.title === 'Busy';
  
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isOpeningCalendar, setIsOpeningCalendar] = useState(false);

  if (!event) return null;

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)); // minutes
  
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

  const handleOpenInCalendar = async () => {
    try {
      setIsOpeningCalendar(true);
      const { CalendarBridge } = await import('../src/plugins/calendar-bridge');
      if (CalendarBridge) {
        const eventId = event.uid || event.id;
        const result = await CalendarBridge.openEventInCalendar({ eventId });
        setTimeout(() => { onClose(); }, 500);
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Error opening calendar event:', error);
      onClose();
    } finally {
      setIsOpeningCalendar(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white border-0 max-w-md mx-auto p-6 rounded-3xl max-h-[90vh] overflow-hidden">
        {/* Header with sleek design */}
        <DialogHeader className="text-center mb-6">
          <DialogTitle className="text-xl font-semibold mb-2 text-white">
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-red-400" />
              </div>
              <span className="truncate">
                {isMinimalEvent ? 'Busy Time' : (event.title || 'Untitled Event')}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Content with proper spacing */}
        <div className="space-y-5">
          {/* Time & Duration */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-start gap-3 text-slate-300">
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-white">
                  {formatDate(startDate)}
                </div>
                <div className="text-sm text-slate-400 mt-1">
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

          {/* Status */}
          {event.status && event.status !== 'none' && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3 text-slate-300">
                <div className="w-5 h-5 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <div className="w-2.5 h-2.5 bg-slate-400 rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Status</div>
                  <div className="font-medium text-sm capitalize text-white">{event.status}</div>
                </div>
              </div>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start gap-3 text-slate-300">
                <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Location</div>
                  <div className="font-medium text-sm text-white truncate">{event.location}</div>
                </div>
              </div>
            </div>
          )}

          {/* URL/Link */}
          {event.url && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start gap-3 text-slate-300">
                <Link className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Link</div>
                  <div className="font-medium text-sm text-blue-400 truncate">
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {event.url}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes Preview */}
          {event.notes && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-300">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <span className="text-xs text-slate-400 uppercase tracking-wide">Notes</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 h-auto text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg"
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
                  <div className="ml-8 p-3 bg-slate-700/30 rounded-lg border border-slate-600/30 overflow-hidden">
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
            </div>
          )}
          
          {/* Info for minimal events */}
          {isMinimalEvent && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-sm text-center break-words">
                This is a busy time block from your calendar.
              </p>
            </div>
          )}
        </div>

        {/* Footer Button with sleek design */}
        <div className="mt-8">
          <Button
            onClick={handleOpenInCalendar}
            disabled={isOpeningCalendar}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl h-12 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all duration-200"
          >
            {isOpeningCalendar ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Opening...
              </>
            ) : (
              <>
                <ExternalLink className="w-5 h-5 mr-2" />
                Open in Calendar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
