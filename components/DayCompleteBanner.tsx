interface DayCompleteBannerProps {
  isBeforeWorkHours?: boolean;
  workStartTime?: string;
  workEndTime?: string;
}

export function DayCompleteBanner({ 
  isBeforeWorkHours = false, 
  workStartTime = '09:00',
  workEndTime = '17:00' 
}: DayCompleteBannerProps) {
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getMainMessage = () => {
    if (isBeforeWorkHours) {
      return `Work starts at ${formatTime(workStartTime)}`;
    }
    return "You've wrapped up for the day!";
  };

  const getSubMessage = () => {
    if (isBeforeWorkHours) {
      return "Time to prepare for the day ahead.";
    }
    return "Nothing more scheduled.";
  };

  const getEmoji = () => {
    if (isBeforeWorkHours) {
      return "🌅";
    }
    return "🎉";
  };

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl py-8 px-6 border border-slate-700/50">
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Main Message with emoji inline */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-white flex items-center justify-center gap-2">
            {getMainMessage()} {!isBeforeWorkHours && <span>{getEmoji()}</span>}
          </h3>
          
          {/* Show emoji for before work hours separately */}
          {isBeforeWorkHours && (
            <div className="text-2xl">{getEmoji()}</div>
          )}
        </div>
        
        {/* Sub Message */}
        <p className="text-slate-400 text-sm">
          {getSubMessage()}
        </p>
        
        {/* Additional info for before work hours */}
        {isBeforeWorkHours && (
          <div className="mt-2 p-3 bg-slate-700/30 rounded-xl border border-slate-600/30">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span>Work hours: {formatTime(workStartTime)} - {formatTime(workEndTime)}</span>
            </div>
          </div>
        )}
        
        {/* Work hours info for after work */}
        {!isBeforeWorkHours && (
          <div className="mt-1 text-slate-500 text-xs">
            Work hours were {formatTime(workStartTime)} - {formatTime(workEndTime)}
          </div>
        )}
      </div>
    </div>
  );
}