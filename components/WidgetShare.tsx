import { useState } from 'react';
import { Share2, Copy, Check, Smartphone, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

export function WidgetShare() {
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const getWidgetUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('widget', 'true');
    return url.toString();
  };

  // Fallback copy method using a temporary textarea
  const fallbackCopyToClipboard = (text: string): boolean => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  };

  const copyWidgetUrl = async () => {
    const url = getWidgetUrl();
    let copySuccessful = false;

    // Try modern Clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        copySuccessful = true;
      } catch (error) {
        console.warn('Clipboard API failed, trying fallback:', error);
        copySuccessful = fallbackCopyToClipboard(url);
      }
    } else {
      // Use fallback method
      copySuccessful = fallbackCopyToClipboard(url);
    }

    if (copySuccessful) {
      setCopied(true);
      toast.success('Widget URL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      // If copying fails, show the URL for manual copying
      setShowUrl(true);
      toast.error('Unable to copy automatically. URL displayed below.');
    }
  };

  const shareWidget = async () => {
    const widgetUrl = getWidgetUrl();
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Gaply Widget',
          text: 'Quick view of my daily tasks and schedule',
          url: widgetUrl,
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    } else {
      // Fallback to clipboard
      copyWidgetUrl();
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-5 h-5 text-blue-400" />
        <h3 className="font-medium text-white">Widget Mode</h3>
      </div>
      
      <p className="text-sm text-slate-300 mb-4">
        Access a compact widget view perfect for quick glances at your schedule and tasks.
      </p>

      <div className="flex gap-2">
        <Button
          onClick={copyWidgetUrl}
          size="sm"
          variant="outline"
          className="flex-1 bg-slate-700/50 border-slate-600 text-white hover:bg-slate-600/50"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy Link
            </>
          )}
        </Button>

        <Button
          onClick={() => window.open(getWidgetUrl(), '_blank')}
          size="sm"
          variant="outline"
          className="bg-slate-700/50 border-slate-600 text-white hover:bg-slate-600/50"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open
        </Button>

        {navigator.share && (
          <Button
            onClick={shareWidget}
            size="sm"
            variant="outline"
            className="bg-blue-600/20 border-blue-500/30 text-blue-300 hover:bg-blue-600/30"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        )}
      </div>

      {/* Show URL manually if copying fails */}
      {showUrl && (
        <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-600/30">
          <p className="text-xs text-slate-400 mb-2">Copy this URL manually:</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={getWidgetUrl()}
              readOnly
              className="flex-1 text-xs bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              onClick={() => setShowUrl(false)}
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white px-2"
            >
              ×
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-700/30">
        <p className="text-xs text-slate-400">
          💡 Add to your home screen for quick access
        </p>
      </div>
    </div>
  );
}