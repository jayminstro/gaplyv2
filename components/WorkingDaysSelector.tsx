import { CheckCircle } from 'lucide-react';

interface WorkingDaysSelectorProps {
  selectedDays: string[];
  onChange: (days: string[]) => void;
  className?: string;
}

const DAYS = [
  { short: 'Mo', full: 'Mon' },
  { short: 'Tu', full: 'Tue' },
  { short: 'We', full: 'Wed' },
  { short: 'Th', full: 'Thu' },
  { short: 'Fri', full: 'Fri' },
  { short: 'Sat', full: 'Sat' },
  { short: 'Sun', full: 'Sun' },
];

export function WorkingDaysSelector({ selectedDays, onChange, className = '' }: WorkingDaysSelectorProps) {
  // Ensure selectedDays is always an array
  const safeSelectedDays = Array.isArray(selectedDays) ? selectedDays : [];
  
  const toggleDay = (dayFull: string) => {
    const newDays = safeSelectedDays.includes(dayFull)
      ? safeSelectedDays.filter(d => d !== dayFull)
      : [...safeSelectedDays, dayFull];
    onChange(newDays);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-slate-300">
        <CheckCircle className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium">Working Days</span>
      </div>
      
      <div className="flex gap-1">
        {DAYS.map((day) => {
          const isSelected = safeSelectedDays.includes(day.full);
          
          return (
            <button
              key={day.full}
              onClick={() => toggleDay(day.full)}
              className={`
                flex-1 py-2.5 px-1 text-sm font-medium rounded-lg border transition-all duration-200
                ${isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-700/60 hover:border-slate-600 hover:text-slate-300'
                }
              `}
            >
              {day.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}