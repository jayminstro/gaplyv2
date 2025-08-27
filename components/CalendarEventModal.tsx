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

  // Function to safely render HTML content
  const renderHtml = (html: string): string => {
    if (!html) return '';
    
    // Basic HTML sanitization - only allow safe tags
    const safeHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '') // Remove object tags
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '') // Remove embed tags
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, ''); // Remove vbscript: protocol
    
    return safeHtml;
  };

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
      <DialogContent className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white border-0 w-[95vw] max-w-[95vw] mx-auto p-4 sm:p-6 rounded-3xl max-h-[90vh] flex flex-col !max-w-[95vw] !w-[95vw] !left-[2.5vw] !translate-x-0 !right-[2.5vw]">
        {/* Clean header layout */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {isMinimalEvent ? 'Busy Time' : 'Event Details'}
            </h2>
          </div>
          <div className="ml-13">
            <h3 className="text-base font-medium text-slate-300 break-words leading-relaxed">
              {isMinimalEvent ? 'Busy Time' : (event.title || 'Untitled Event')}
            </h3>
          </div>
        </div>

        {/* Content with proper spacing and scrolling */}
        <div className="space-y-5 max-w-full overflow-y-auto flex-1">
          {/* Time & Duration */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full overflow-hidden">
            <div className="flex items-start gap-3 text-slate-300">
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                <div className="font-medium text-sm text-white break-words overflow-hidden">
                  {formatDate(startDate)}
                </div>
                <div className="text-sm text-slate-400 mt-1 overflow-hidden">
                  <span className="break-words overflow-hidden">{formatTime(startDate)} - {formatTime(endDate)}</span>
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
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full">
              <div className="flex items-center gap-3 text-slate-300">
                <div className="w-5 h-5 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <div className="w-2.5 h-2.5 bg-slate-400 rounded-full" />
                </div>
                <div className="flex-1 min-w-0 max-w-full">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Status</div>
                  <div className="font-medium text-sm capitalize text-white break-words">{event.status}</div>
                </div>
              </div>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full">
              <div className="flex items-start gap-3 text-slate-300">
                <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 max-w-full">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Location</div>
                  <div className="font-medium text-sm text-white break-all">{event.location}</div>
                </div>
              </div>
            </div>
          )}

          {/* URL/Link */}
          {event.url && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full">
              <div className="flex items-start gap-3 text-slate-300">
                <Link className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 max-w-full">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Link</div>
                  <div className="font-medium text-sm text-blue-400 break-all">
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
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full">
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
                  <div className="ml-8 p-3 bg-slate-700/30 rounded-lg border border-slate-600/30 overflow-hidden max-w-full">
                    <div 
                      className="text-slate-300 text-sm max-w-full overflow-hidden prose prose-invert prose-sm"
                      dangerouslySetInnerHTML={{ __html: renderHtml(event.notes) }}
                    />
                  </div>
                )}
                
                {!notesExpanded && (
                  <div className="ml-8 overflow-hidden max-w-full">
                    <div 
                      className="text-slate-400 text-sm max-w-full overflow-hidden prose prose-invert prose-sm"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                      dangerouslySetInnerHTML={{ __html: renderHtml(event.notes) }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Info for minimal events */}
          {isMinimalEvent && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 max-w-full">
              <p className="text-slate-400 text-sm text-center break-words max-w-full">
                This is a busy time block from your calendar.
              </p>
            </div>
          )}
        </div>

        {/* Footer Button with sleek design */}
        <div className="mt-8 flex-shrink-0">
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
