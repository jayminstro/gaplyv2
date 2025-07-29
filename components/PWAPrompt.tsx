import { useState, useEffect } from 'react';
import { X, Download, Smartphone, Share } from 'lucide-react';
import { Button } from './ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if app is already installed
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                              (window.navigator as any).standalone === true;
    
    if (isInStandaloneMode) {
      return; // Don't show prompt if already installed
    }

    // Handle Android install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      
      // Show prompt after a short delay to not interrupt user
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    // Detect iOS devices
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIOSChrome = isIOS && /CriOS/.test(navigator.userAgent);
    const isIOSSafari = isIOS && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(navigator.userAgent);
    
    if (isIOSSafari) {
      // Show iOS install instructions after delay
      setTimeout(() => {
        const hasSeenPrompt = localStorage.getItem('gaply-ios-install-prompt-shown');
        if (!hasSeenPrompt) {
          setShowIOSPrompt(true);
        }
      }, 5000);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleIOSPromptDismiss = () => {
    setShowIOSPrompt(false);
    localStorage.setItem('gaply-ios-install-prompt-shown', 'true');
  };

  const handlePromptDismiss = () => {
    setShowPrompt(false);
    // Don't show again for a while
    localStorage.setItem('gaply-install-prompt-dismissed', Date.now().toString());
  };

  if (showIOSPrompt) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700/50 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Install Gaply</h3>
            <button
              onClick={handleIOSPromptDismiss}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">Add to Home Screen</p>
              <p className="text-slate-400 text-sm">Get the full app experience</p>
            </div>
          </div>
          
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-xs">1</span>
              <span>Tap the Share button</span>
              <Share className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-xs">2</span>
              <span>Select "Add to Home Screen"</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-xs">3</span>
              <span>Tap "Add" to install</span>
            </div>
          </div>
          
          <Button
            onClick={handleIOSPromptDismiss}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Got it
          </Button>
        </div>
      </div>
    );
  }

  if (showPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50">
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 rounded-2xl p-4 border border-slate-700/50 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-white font-medium">Install Gaply</h4>
                <p className="text-slate-400 text-sm">Add to home screen for quick access</p>
              </div>
            </div>
            <button
              onClick={handlePromptDismiss}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={handlePromptDismiss}
              variant="outline"
              className="flex-1 bg-slate-700/50 border-slate-600 text-slate-300"
              size="sm"
            >
              Not now
            </Button>
            <Button
              onClick={handleInstallClick}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              Install
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}