import { useState, useEffect } from 'react';
import { Clock, Target, Calendar, TrendingUp } from 'lucide-react';
import { Task, TimeGap } from '../types/index';
import { formatTime } from '../utils/helpers';

interface WidgetViewProps {
  tasks: Task[];
  gaps: TimeGap[];
  userName?: string;
}

interface WidgetStats {
  tasksToday: number;
  totalFocusTime: number;
  nextGap: TimeGap | null;
  runningTask: Task | null;
  completedToday: number;
}

export function WidgetView({ tasks, gaps, userName }: WidgetViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState<WidgetStats>({
    tasksToday: 0,
    totalFocusTime: 0,
    nextGap: null,
    runningTask: null,
    completedToday: 0
  });

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Calculate widget stats
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // Filter today's tasks
    const todayTasks = tasks.filter(task => {
      if (!task.due_date) return false;
      const taskDate = new Date(task.due_date).toISOString().split('T')[0];
      return taskDate === today;
    });

    // Find completed tasks today
    const completedToday = todayTasks.filter(task => task.status === 'completed').length;

    // Calculate total focus time for today (sum of timer durations)
    const totalFocusTime = todayTasks.reduce((total, task) => {
      if (task.timerTotal) {
        return total + task.timerTotal;
      }
      return total;
    }, 0);

    // Find running task
    const runningTask = tasks.find(task => task.isTimerRunning) || null;

    // Find next available gap
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const nextGap = gaps
      .filter(gap => {
        if (!gap.start_time) return false;
        const gapTime = gap.start_time.includes(':') ? gap.start_time : 
          new Date(gap.start_time).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        return gapTime > currentTime;
      })
      .sort((a, b) => {
        const aTime = a.start_time?.includes(':') ? a.start_time : 
          new Date(a.start_time || '').toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        const bTime = b.start_time?.includes(':') ? b.start_time : 
          new Date(b.start_time || '').toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        return (aTime || '').localeCompare(bTime || '');
      })[0] || null;

    setStats({
      tasksToday: todayTasks.length,
      totalFocusTime,
      nextGap,
      runningTask,
      completedToday
    });
  }, [tasks, gaps]);

  const formatFocusTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatNextGapTime = (gap: TimeGap) => {
    if (!gap.start_time) return '';
    
    let timeStr = gap.start_time;
    if (!gap.start_time.includes(':')) {
      timeStr = new Date(gap.start_time).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    return timeStr;
  };

  return (
    <div className="bg-gradient-to-br from-slate-800/90 to-blue-900/90 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </h3>
          <p className="text-sm text-slate-300">
            {currentTime.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">
            {currentTime.toLocaleTimeString('en-US', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
        </div>
      </div>

      {/* Running Task Alert */}
      {stats.runningTask && (
        <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-300">Timer Running</span>
          </div>
          <p className="text-white font-medium text-sm mt-1 truncate">
            {stats.runningTask.title}
          </p>
          <p className="text-xs text-slate-300">
            {formatTime(stats.runningTask.timerRemaining || 0)} remaining
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Tasks Today */}
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Today</span>
          </div>
          <p className="text-lg font-bold text-white">
            {stats.completedToday}/{stats.tasksToday}
          </p>
          <p className="text-xs text-slate-300">tasks</p>
        </div>

        {/* Focus Time */}
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">Focus</span>
          </div>
          <p className="text-lg font-bold text-white">
            {formatFocusTime(stats.totalFocusTime)}
          </p>
          <p className="text-xs text-slate-300">today</p>
        </div>
      </div>

      {/* Next Gap */}
      {stats.nextGap && (
        <div className="bg-gradient-to-r from-orange-500/10 to-pink-500/10 border border-orange-400/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-orange-300">Next Gap</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {formatNextGapTime(stats.nextGap)}
              </p>
              <p className="text-xs text-slate-300">
                {stats.nextGap.duration_minutes}min available
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-orange-400" />
          </div>
        </div>
      )}

      {/* No gaps message */}
      {!stats.nextGap && (
        <div className="bg-slate-800/30 border border-slate-700/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-500">Schedule</span>
          </div>
          <p className="text-sm text-slate-400">No gaps remaining today</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-700/30">
        <p className="text-xs text-center text-slate-400">
          Tap to open full app
        </p>
      </div>
    </div>
  );
}