import { ChevronRight, Zap, Leaf, BookOpen, Timer, MoreHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { TodayTimeline } from './TodayTimeline';
import { HomeSummary } from './HomeSummary';
import { renderSafeIcon, getActivityTime, getActivityIconColor } from '../utils/helpers';
import { suggestionsAPI } from '../utils/api';
import { 
  LAYOUT_CONSTANTS, 
  COMPONENT_PATTERNS, 
  SectionWrapper,
  CardWrapper,
  layoutClasses 
} from '../utils/layout';

interface HomeContentProps {
  globalTasks: Task[];
  gaps: TimeGap[];
  userName?: string;
  userPreferences?: UserPreferences;
  onOpenTask?: (task: Task) => void;
  onTaskCreated?: (task: Task) => void;
}

export function HomeContent({ 
  globalTasks,
  gaps,
  userName,
  userPreferences,
  onOpenTask,
  onTaskCreated 
}: HomeContentProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const suggestionsData = await suggestionsAPI.get().catch(() => []);
        setSuggestions(suggestionsData || []);
      } catch (error) {
        console.error('Error loading suggestions data:', error);
      }
    };

    loadHomeData();
  }, []);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 px-6 pt-2 pb-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-semibold mb-2 text-white">
            {getGreeting()}, {userName || 'there'}
          </h1>
          <p className="text-slate-400 text-base">
            Ready to make the most of your time?
          </p>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto ios-scroll android-scroll no-bounce px-6 pt-2">
        {/* Dynamic Stats Summary */}
        <SectionWrapper>
          <HomeSummary 
            globalTasks={globalTasks}
            gaps={gaps}
            userName={userName}
          />
        </SectionWrapper>

        {/* Today Section */}
        <SectionWrapper>
          <h2 className={layoutClasses(LAYOUT_CONSTANTS.TITLE_MEDIUM, LAYOUT_CONSTANTS.SUBTITLE_MARGIN_BOTTOM)}>
            Today
          </h2>
          <TodayTimeline 
            tasks={globalTasks}
            gaps={gaps}
            currentTime={new Date()}
            userPreferences={userPreferences}
            onItemClick={(item) => {
              if (item.type === 'task' && item.data) {
                onOpenTask?.(item.data as Task);
              }
            }}
            onTaskSelect={(task) => {
              onOpenTask?.(task);
            }}
            onStartTimer={(task) => {
              onOpenTask?.(task);
            }}
            onTaskCreated={onTaskCreated}
          />
        </SectionWrapper>

        {/* Suggestions */}
        <SectionWrapper>
          <div className={layoutClasses(COMPONENT_PATTERNS.FLEX_BETWEEN, LAYOUT_CONSTANTS.SUBTITLE_MARGIN_BOTTOM)}>
            <h2 className={LAYOUT_CONSTANTS.TITLE_MEDIUM}>Suggestions for 10 min</h2>
            <ChevronRight className="w-5 h-5" />
          </div>
          
          <div className="flex flex-wrap gap-3 pb-2">
            {(suggestions || []).map((suggestion) => (
              <div 
                key={suggestion.id}
                className={layoutClasses(
                  suggestion.color, 
                  LAYOUT_CONSTANTS.ROUNDED_LARGE, 
                  'p-4 min-w-[80px] text-center cursor-pointer',
                  LAYOUT_CONSTANTS.HOVER_SCALE
                )}
              >
                {renderSafeIcon(suggestion.icon, 'w-6 h-6 mx-auto mb-2')}
                <div className={LAYOUT_CONSTANTS.TEXT_SMALL}>{suggestion.title}</div>
              </div>
            ))}
            <div className={layoutClasses(
              'bg-blue-900', 
              LAYOUT_CONSTANTS.ROUNDED_LARGE, 
              'p-4 min-w-[80px] text-center'
            )}>
              <MoreHorizontal className="w-6 h-6 mx-auto mb-2" />
              <div className={LAYOUT_CONSTANTS.TEXT_SMALL}>More</div>
            </div>
          </div>
        </SectionWrapper>

        {/* Recent Activity */}
        <div className="pb-8">
          <h2 className={layoutClasses(LAYOUT_CONSTANTS.TITLE_MEDIUM, LAYOUT_CONSTANTS.SUBTITLE_MARGIN_BOTTOM)}>
            Recent activity
          </h2>
          <div className={COMPONENT_PATTERNS.GRID_2_COLS}>
            {(globalTasks || []).slice(0, 4).map((task, index) => (
              <CardWrapper
                key={`recent-${task.id}-${index}`}
                onClick={() => onOpenTask?.(task)}
                className="text-left"
              >
                <div className={COMPONENT_PATTERNS.FLEX_START}>
                  <div className={layoutClasses(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    getActivityIconColor(task.iconColor)
                  )}>
                    {renderSafeIcon(task.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={layoutClasses(LAYOUT_CONSTANTS.TEXT_SMALL, 'truncate')}>
                      {task.title}
                    </div>
                    <div className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT, LAYOUT_CONSTANTS.TEXT_TINY)}>
                      {getActivityTime(index)} • {parseInt(task.duration.split(':')[1])} min
                    </div>
                  </div>
                </div>
              </CardWrapper>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}