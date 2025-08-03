import { CheckCircle } from 'lucide-react';

interface ToggleGroupProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  options: string[];
  selectedOptions: string[];
  onChange: (options: string[]) => void;
  className?: string;
  columns?: number;
}

export function ToggleGroup({ 
  title, 
  icon: Icon, 
  options, 
  selectedOptions, 
  onChange, 
  className = '',
  columns = 2
}: ToggleGroupProps) {
  // Ensure selectedOptions is always an array
  const safeSelectedOptions = Array.isArray(selectedOptions) ? selectedOptions : [];
  
  const toggleOption = (option: string) => {
    const newOptions = safeSelectedOptions.includes(option)
      ? safeSelectedOptions.filter(o => o !== option)
      : [...safeSelectedOptions, option];
    onChange(newOptions);
  };

  const gridCols = columns === 1 ? 'grid-cols-1' : 
                  columns === 3 ? 'grid-cols-3' : 
                  columns === 4 ? 'grid-cols-4' : 'grid-cols-2';

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-slate-300">
        {Icon ? (
          <Icon className="w-4 h-4 text-blue-400" />
        ) : (
          <CheckCircle className="w-4 h-4 text-blue-400" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      
      <div className={`grid gap-2 ${gridCols}`}>
        {options.map((option) => {
          const isSelected = safeSelectedOptions.includes(option);
          
          return (
            <button
              key={option}
              onClick={() => toggleOption(option)}
              className={`
                py-2.5 px-3 text-sm font-medium rounded-lg border transition-all duration-200
                ${isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-700/60 hover:border-slate-600 hover:text-slate-300'
                }
              `}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}