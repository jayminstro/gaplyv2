import { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Check, AlertCircle, ExternalLink, Unlink } from 'lucide-react';
import { Button } from "./ui/button";
import { toast } from 'sonner';

interface CalendarSyncProps {
  onStatusChange?: (connected: boolean) => void;
}

interface CalendarStatus {
  connected: boolean;
  email: string | null;
  lastSync: string | null;
  gapsCount: number;
}

export function CalendarSync({ onStatusChange }: CalendarSyncProps) {
  const [status, setStatus] = useState<CalendarStatus>({
    connected: false,
    email: null,
    lastSync: null,
    gapsCount: 0
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    loadStatus();
    
    // Check if we just returned from Google OAuth
    const wasConnecting = localStorage.getItem('gaply_calendar_connecting');
    const calendarError = localStorage.getItem('gaply_calendar_error');
    
    if (wasConnecting === 'true') {
      localStorage.removeItem('gaply_calendar_connecting');
      localStorage.removeItem('gaply_return_url');
      
      // Show success message and reload status
      setTimeout(() => {
        loadStatus();
        toast.success('Google Calendar connected successfully!');
      }, 1000);
    } else if (calendarError) {
      localStorage.removeItem('gaply_calendar_error');
      toast.error('Failed to connect Google Calendar', {
        description: calendarError
      });
    }
    
    setIsConnecting(false);
  }, []);

  useEffect(() => {
    onStatusChange?.(status.connected);
  }, [status.connected, onStatusChange]);

  const loadStatus = async () => {
    try {
      const { supabase } = await import('../utils/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return;
      }

      const { projectId } = await import('../utils/supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/google-calendar/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error loading calendar status:', error);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    
    try {
      const { supabase } = await import('../utils/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { projectId } = await import('../utils/supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/google-calendar/auth-url`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      
      const { authUrl } = await response.json();
      
      // Store the current state to restore after redirect
      localStorage.setItem('gaply_calendar_connecting', 'true');
      localStorage.setItem('gaply_return_url', window.location.href);
      
      // Redirect to Google OAuth (better than popup)
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to connect Google Calendar', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    
    try {
      const { supabase } = await import('../utils/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { projectId } = await import('../utils/supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/google-calendar/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
      
      await loadStatus();
      toast.success('Google Calendar disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect Google Calendar');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    
    try {
      const { supabase } = await import('../utils/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { projectId } = await import('../utils/supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/google-calendar/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Sync failed');
      }
      
      const result = await response.json();
      await loadStatus();
      
      toast.success('Calendar synced successfully', {
        description: `Found ${result.gapsFound} available time slots`
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Failed to sync calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never';
    
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (!status.connected) {
    return (
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-white mb-2">Connect Google Calendar</h3>
            <p className="text-slate-400 text-sm mb-4">
              Sync your calendar to automatically find available time slots for your activities.
            </p>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect Calendar
                </>
              )}
            </Button>
            
            {isConnecting && (
              <p className="text-slate-400 text-sm mt-2">
                You'll be redirected to Google to authorize access...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white mb-1">Google Calendar Connected</h3>
            <p className="text-slate-400 text-sm">{status.email}</p>
          </div>
        </div>
        <Button
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          variant="outline"
          size="sm"
          className="border-red-600/50 text-red-400 hover:bg-red-500/10 rounded-xl"
        >
          {isDisconnecting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Unlink className="w-4 h-4 mr-2" />
              Disconnect
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-700/50 rounded-xl p-3">
          <div className="text-slate-400 text-xs mb-1">Available Slots</div>
          <div className="text-white text-lg font-medium">{status.gapsCount}</div>
        </div>
        <div className="bg-slate-700/50 rounded-xl p-3">
          <div className="text-slate-400 text-xs mb-1">Last Sync</div>
          <div className="text-white text-lg font-medium">{formatLastSync(status.lastSync)}</div>
        </div>
      </div>

      <Button
        onClick={handleSync}
        disabled={isSyncing}
        className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl"
      >
        {isSyncing ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Now
          </>
        )}
      </Button>
    </div>
  );
}