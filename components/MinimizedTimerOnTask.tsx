interface MinimizedTimerOnTaskProps {
  duration: number; // total time in seconds
  elapsed: number; // current elapsed time in seconds
  onClick: () => void;
}

export function MinimizedTimerOnTask({ duration, elapsed, onClick }: MinimizedTimerOnTaskProps) {
  // Calculate remaining time and progress
  const remaining = Math.max(0, duration - elapsed);
  const progress = duration > 0 ? elapsed / duration : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress * circumference);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <button
      onClick={onClick}
      className="w-10 h-10 rounded-full bg-muted/20 backdrop-blur-sm relative flex items-center justify-center hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent"
      role="button"
      aria-label="Open timer for task"
      tabIndex={0}
      title="Tap to open timer"
    >
      {/* Background circle */}
      <div className="absolute inset-1 rounded-full bg-slate-800/60" />
      
      {/* Progress Ring */}
      <svg 
        className="w-9 h-9 transform -rotate-90 absolute inset-0.5" 
        viewBox="0 0 36 36"
      >
        {/* Background track */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className="text-slate-700/40"
        />
        
        {/* Progress arc */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-blue-400 transition-all duration-1000 ease-linear"
        />
      </svg>
      
      {/* Timer Display */}
      <span className="text-[10px] font-semibold text-white/90 relative z-10 font-mono">
        {formatTime(remaining)}
      </span>
    </button>
  );
}