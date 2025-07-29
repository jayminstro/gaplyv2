import { useState, useEffect } from 'react';
import { WifiOff, Wifi, AlertCircle } from 'lucide-react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowIndicator(true);
      // Hide the "back online" message after 3 seconds
      setTimeout(() => setShowIndicator(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Show indicator initially if offline
    if (!navigator.onLine) {
      setShowIndicator(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showIndicator) return null;

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-sm font-medium transition-all duration-300 ${
        isOnline 
          ? 'bg-green-600 text-white' 
          : 'bg-red-600 text-white'
      }`}
      style={{
        paddingTop: `max(12px, env(safe-area-inset-top, 12px))`
      }}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span>You're offline</span>
          </>
        )}
      </div>
    </div>
  );
}