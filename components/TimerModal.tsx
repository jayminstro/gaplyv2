import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Play, Pause, Square, Plus, ChevronDown } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  category: string;
  duration: string;
  dueDate?: string;
  dueTime?: string;
  status: 'scheduled' | 'overdue' | 'draft';
  isTimerRunning?: boolean;
  timerRemaining?: number;
  timerTotal?: number;
  iconColor: string;
  icon: React.ReactNode;
}

interface TimerModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTimerUpdate: (task: Task, isRunning: boolean, remaining: number, total?: number) => void;
}

export function TimerModal({ task, isOpen, onClose, onTimerUpdate }: TimerModalProps) {
  const [isRunning, setIsRunning] = useState(task?.isTimerRunning || false);
  const [timeRemaining, setTimeRemaining] = useState(() => {
    if (task?.timerRemaining) return task.timerRemaining;
    const minutes = parseInt(task?.duration.split(' ')[0] || '10');
    return minutes * 60;
  });
  
  const [timerTotal, setTimerTotal] = useState(() => {
    if (task?.timerTotal) return task.timerTotal;
    const minutes = parseInt(task?.duration.split(' ')[0] || '10');
    return minutes * 60;
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          if (task) {
            onTimerUpdate(task, true, newTime, timerTotal);
          }
          return newTime;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, task, onTimerUpdate]);

  useEffect(() => {
    if (timeRemaining === 0 && isRunning) {
      setIsRunning(false);
      if (task) {
        onTimerUpdate(task, false, 0, timerTotal);
      }
    }
  }, [timeRemaining, isRunning, task, onTimerUpdate]);

  const handlePlayPause = () => {
    const newIsRunning = !isRunning;
    setIsRunning(newIsRunning);
    if (task) {
      onTimerUpdate(task, newIsRunning, timeRemaining, timerTotal);
    }
  };

  const handleEnd = () => {
    setIsRunning(false);
    const resetTime = timerTotal;
    setTimeRemaining(resetTime);
    if (task) {
      onTimerUpdate(task, false, resetTime, timerTotal);
    }
  };

  const handleAddTime = () => {
    const newTotal = timerTotal + 300; // Add 5 minutes (300 seconds)
    const newRemaining = timeRemaining + 300;
    setTimerTotal(newTotal);
    setTimeRemaining(newRemaining);
    if (task) {
      onTimerUpdate(task, isRunning, newRemaining, newTotal);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTargetTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}:00`;
  };

  const progress = timerTotal > 0 ? (timerTotal - timeRemaining) / timerTotal : 0;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress * circumference);

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white border-0 max-w-sm mx-auto p-8 rounded-3xl">
        <DialogHeader className="text-center mb-8">
          <DialogTitle className="text-2xl font-semibold mb-2 text-white">
            {task.title}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            {task.category} • Active timer session
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Ring */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <svg className="w-64 h-64 transform -rotate-90" viewBox="0 0 280 280">
              {/* Outer glow effect */}
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3A8DFF" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge> 
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              
              {/* Background track */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                stroke="#1e293b"
                strokeWidth="8"
                fill="none"
                className="opacity-60"
              />
              
              {/* Progress arc */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                stroke="url(#progressGradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
                filter="url(#glow)"
              />
            </svg>
            
            {/* Timer Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-mono font-bold text-slate-100 mb-3">
                {formatTime(timeRemaining)}
              </div>
              <div className="text-base text-slate-500">
                {formatTargetTime(timerTotal)}
              </div>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-8 mb-8">
          {/* +5 min button */}
          <div className="flex flex-col items-center">
            <Button
              onClick={handleAddTime}
              className="w-14 h-14 rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 border-0 shadow-lg touch-manipulation"
              size="icon"
              type="button"
              aria-label="Add 5 minutes"
            >
              <Plus className="w-6 h-6 text-white" />
            </Button>
            <span className="text-xs text-slate-400 mt-2">+5 min</span>
          </div>
          
          {/* Play/Pause button */}
          <div className="flex flex-col items-center">
            <Button
              onClick={handlePlayPause}
              className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 border-0 shadow-xl touch-manipulation"
              size="icon"
              type="button"
              aria-label={isRunning ? 'Pause timer' : 'Start timer'}
            >
              {isRunning ? (
                <Pause className="w-7 h-7 text-white" />
              ) : (
                <Play className="w-7 h-7 text-white ml-1" />
              )}
            </Button>
            <span className="text-xs text-blue-400 mt-2">
              {isRunning ? 'Pause' : 'Play'}
            </span>
          </div>
          
          {/* End button */}
          <div className="flex flex-col items-center">
            <Button
              onClick={handleEnd}
              className="w-14 h-14 rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 border-0 shadow-lg touch-manipulation"
              size="icon"
              type="button"
              aria-label="End timer"
            >
              <Square className="w-5 h-5 text-white" />
            </Button>
            <span className="text-xs text-slate-400 mt-2">End</span>
          </div>
        </div>

        {/* Minimize Button */}
        <div className="flex justify-center">
          <Button
            onClick={onClose}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border-0 shadow-md text-sm touch-manipulation"
            type="button"
            aria-label="Minimize timer"
          >
            <ChevronDown className="w-4 h-4" />
            Minimize
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}