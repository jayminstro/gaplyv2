import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Calendar, Clock, User, Users, Link, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: number; // timestamp in milliseconds
  end: number;   // timestamp in milliseconds
  isAllDay: boolean;
  // Rich event properties
  organizer?: {
    name?: string;
    email?: string;
  };
  attendees?: Array<{
    email: string;
    name?: string;
    responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
    isOrganizer?: boolean;
  }>;
  location?: string;
  notes?: string;
  url?: string;
  transparency?: 'opaque' | 'transparent';
  status?: 'none' | 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRules?: string[];
  lastModifiedDate?: number; // timestamp in milliseconds
  creationDate?: number; // timestamp in milliseconds
  // Conference data
  conferenceData?: {
    entryPoints?: Array<{
      uri: string;
      entryPointType: 'video' | 'phone' | 'sip' | 'more';
      label?: string;
    }>;
  };
}

interface CalendarEventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarEventModal({ event, isOpen, onClose }: CalendarEventModalProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);

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



  const hasVideoConference = event.conferenceData?.entryPoints?.some(ep => 
    ep.entryPointType === 'video'
  );

  const videoConferenceLink = event.conferenceData?.entryPoints?.find(ep => 
    ep.entryPointType === 'video'
  );

  const handleOpenInCalendar = () => {
    // This would open the event in the device's default calendar app
    // For now, we'll just close the modal and could implement this later
    console.log('Opening calendar event in device calendar:', event.id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 rounded-2xl max-w-md w-full mx-4 p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-white text-xl font-semibold flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-red-400" />
            </div>
            <span className="truncate">
              {isMinimalEvent ? 'Busy Time' : (event.title || 'Untitled Event')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Time & Duration */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-slate-300">
              <Clock className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <div className="font-medium">
                  {formatDate(startDate)}
                </div>
                <div className="text-sm text-slate-400">
                  {formatTime(startDate)} - {formatTime(endDate)}
                  {!event.isAllDay && (
                    <span className="ml-2 text-slate-500">
                      ({formatDuration(duration)})
                    </span>
                  )}
                </div>
              </div>
            </div>
            

          </div>

          {/* Organizer */}
          {event.organizer && (
            <div className="flex items-center gap-3 text-slate-300">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm text-slate-400">Organizer</div>
                <div className="font-medium">{event.organizer.name || event.organizer.email}</div>
              </div>
            </div>
          )}

          {/* Attendees Count */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-3 text-slate-300">
              <Users className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm text-slate-400">Attendees</div>
                <div className="font-medium">{event.attendees.length} people</div>
              </div>
            </div>
          )}

          {/* Conferencing Link */}
          {hasVideoConference && videoConferenceLink && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-300">
                <Link className="w-5 h-5 text-slate-400" />
                <div className="text-sm text-slate-400">Video Conference</div>
              </div>
              <Button
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700/50 rounded-xl h-11 bg-slate-800/60"
                onClick={() => window.open(videoConferenceLink.uri, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Join Meeting
              </Button>
            </div>
          )}

          {/* Notes Preview */}
          {event.notes && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-300">
                <FileText className="w-5 h-5 text-slate-400" />
                <div className="text-sm text-slate-400">Notes</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto p-1 h-auto text-slate-400 hover:text-slate-300 hover:bg-slate-800/50"
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
                <div className="ml-8 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">
                    {event.notes}
                  </p>
                </div>
              )}
              
              {!notesExpanded && (
                <div className="ml-8">
                  <p className="text-slate-400 text-sm line-clamp-2">
                    {event.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Info for minimal events */}
          {isMinimalEvent && (
            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <p className="text-slate-400 text-sm text-center">
                This is a busy time block from your calendar. 
                {event.organizer && ` Organized by ${event.organizer.name || event.organizer.email}.`}
              </p>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-3 text-slate-300">
              <div className="w-5 h-5 rounded-full bg-slate-700/50 flex items-center justify-center">
                <div className="w-2 h-2 bg-slate-400 rounded-full" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Location</div>
                <div className="font-medium">{event.location}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Button */}
        <div className="px-6 py-4 border-t border-slate-700/50">
          <Button
            onClick={handleOpenInCalendar}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl h-11 shadow-lg"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in Calendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
