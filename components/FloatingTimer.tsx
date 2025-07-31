import { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Task } from '../types/index';

interface FloatingTimerProps {
  task: Task | null;
  isVisible: boolean;
  onTimerUpdate: (task: Task, isRunning: boolean, remaining: number, total?: number) => Promise<void>;
  onExpand: () => void;
}

export function FloatingTimer({ task, isVisible, onTimerUpdate, onExpand }: FloatingTimerProps) {
  const [isRunning, setIsRunning] = useState(task?.isTimerRunning || false);
  const [timeRemaining, setTimeRemaining] = useState(task?.timerRemaining || 0);
  const [timerTotal, setTimerTotal] = useState(task?.timerTotal || 0);

  // Update local state when task changes
  useEffect(() => {
    if (task) {
      setIsRunning(task.isTimerRunning || false);
      setTimeRemaining(task.timerRemaining || 0);
      setTimerTotal(task.timerTotal || 0);
    }
  }, [task]);

  // Timer countdown effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeRemaining > 0 && task) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          onTimerUpdate(task, true, newTime, timerTotal);
          return newTime;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, task, onTimerUpdate, timerTotal]);

  // Stop timer when it reaches 0
  useEffect(() => {
    if (timeRemaining === 0 && isRunning && task) {
      setIsRunning(false);
      onTimerUpdate(task, false, 0, timerTotal);
    }
  }, [timeRemaining, isRunning, task, onTimerUpdate, timerTotal]);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task) return;
    
    const newIsRunning = !isRunning;
    setIsRunning(newIsRunning);
    onTimerUpdate(task, newIsRunning, timeRemaining, timerTotal);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!task || !isVisible) return null;

  const progress = timerTotal > 0 ? (timerTotal - timeRemaining) / timerTotal : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <div 
      className="fixed bottom-24 right-4 z-50 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-md cursor-pointer transition-all hover:bg-black/75 active:scale-95 touch-manipulation"
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      <div className="p-2.5 flex items-center gap-2.5">
        {/* Progress Ring */}
        <div className="relative w-10 h-10 flex items-center justify-center">
          <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 40 40">
            {/* Background track */}
            <circle
              cx="20"
              cy="20"
              r={radius}
              stroke="currentColor"
              strokeWidth="2.5"
              fill="none"
              className="text-slate-700/40"
            />
            
            {/* Progress arc */}
            <circle
              cx="20"
              cy="20"
              r={radius}
              stroke="currentColor"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-blue-400 transition-all duration-1000 ease-linear"
            />
          </svg>
          
          {/* Play/Pause button overlay */}
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 w-5 h-5 m-auto rounded-full bg-blue-500/20 hover:bg-blue-500/30 active:bg-blue-500/40 transition-colors flex items-center justify-center touch-manipulation"
            type="button"
            aria-label={isRunning ? 'Pause timer' : 'Play timer'}
          >
            {isRunning ? (
              <Pause className="w-2.5 h-2.5 text-blue-400" />
            ) : (
              <Play className="w-2.5 h-2.5 text-blue-400 ml-0.5" />
            )}
          </button>
        </div>
        
        {/* Timer Info */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-xs font-medium truncate">
            {task.title}
          </div>
          <div className="text-slate-400 text-xs font-mono">
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>
    </div>
  );
}