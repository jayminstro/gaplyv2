import { Clock, Calendar, FileText, AlertTriangle } from 'lucide-react';
import { Task } from '../types/index';
import { TaskTile } from './TaskTile';
import { LAYOUT_CONSTANTS, COMPONENT_PATTERNS, layoutClasses } from '../utils/layout';

interface CategorizedTasksProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onTimer: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

interface TaskCategory {
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  tasks: Task[];
  description: string;
}

export function CategorizedTasks({
  tasks,
  onEdit,
  onTimer,
  onComplete,
  onDelete
}: CategorizedTasksProps) {

  const categorizeTask = (task: Task): 'overdue' | 'today' | 'upcoming' | 'draft' => {
    // Draft tasks - no due date or time
    if (!task.dueDate) {
      return 'draft';
    }

    // Skip completed tasks - they won't be shown in any category
    if (task.isCompleted || task.is_completed || task.status === 'completed') {
      return 'draft'; // This will be filtered out later
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    // Today's tasks
    if (task.dueDate === today) {
      // If no due time, consider it for today (not overdue yet)
      if (!task.dueTime) {
        return 'today';
      }
      
      // Compare times properly - if due time has passed today, it's overdue
      const taskTime = task.dueTime; // Should be in HH:MM format
      if (taskTime < currentTime) {
        return 'overdue';
      }
      
      return 'today';
    }

    // Past dates are overdue (regardless of time)
    if (task.dueDate < today) {
      return 'overdue';
    }

    // Future dates are upcoming
    return 'upcoming';
  };

  const sortTasksWithinCategory = (tasks: Task[], category: 'overdue' | 'today' | 'upcoming' | 'draft'): Task[] => {
    return tasks.sort((a, b) => {
      switch (category) {
        case 'today':
          // Sort by due time for today's tasks
          if (a.dueTime && b.dueTime) {
            return a.dueTime.localeCompare(b.dueTime);
          }
          if (a.dueTime && !b.dueTime) return -1;
          if (!a.dueTime && b.dueTime) return 1;
          return a.title.localeCompare(b.title);
          
        case 'overdue':
          // Sort by due date (oldest first), then by time
          const dateCompare = (a.dueDate || '').localeCompare(b.dueDate || '');
          if (dateCompare !== 0) return dateCompare;
          
          if (a.dueTime && b.dueTime) {
            return a.dueTime.localeCompare(b.dueTime);
          }
          return a.title.localeCompare(b.title);
          
        case 'upcoming':
          // Sort by due date (nearest first), then by time
          const upcomingDateCompare = (a.dueDate || '').localeCompare(b.dueDate || '');
          if (upcomingDateCompare !== 0) return upcomingDateCompare;
          
          if (a.dueTime && b.dueTime) {
            return a.dueTime.localeCompare(b.dueTime);
          }
          return a.title.localeCompare(b.title);
          
        case 'draft':
        default:
          // Sort by title for draft tasks
          return a.title.localeCompare(b.title);
      }
    });
  };

  // Filter out completed tasks and categorize the rest
  const incompleteTasks = tasks.filter(task => 
    !task.isCompleted && 
    !task.is_completed && 
    task.status !== 'completed'
  );

  // Categorize and sort tasks
  const categorizedTasks = incompleteTasks.reduce((acc, task) => {
    const category = categorizeTask(task);
    if (!acc[category]) acc[category] = [];
    acc[category].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  // Sort tasks within each category
  Object.keys(categorizedTasks).forEach(category => {
    categorizedTasks[category] = sortTasksWithinCategory(
      categorizedTasks[category], 
      category as 'overdue' | 'today' | 'upcoming' | 'draft'
    );
  });

  const getTaskDescription = (category: string, tasks: Task[]): string => {
    const count = tasks.length;
    const taskText = count === 1 ? 'task' : 'tasks';
    
    switch (category) {
      case 'overdue':
        return count > 0 ? `${count} overdue ${taskText}` : 'No overdue tasks';
      case 'today':
        return count > 0 ? `${count} ${taskText} due today` : 'No tasks due today';
      case 'upcoming':
        return count > 0 ? `${count} upcoming ${taskText}` : 'No upcoming tasks';
      case 'draft':
        return count > 0 ? `${count} ${taskText} without due dates` : 'No draft tasks';
      default:
        return `${count} ${taskText}`;
    }
  };

  const categories: TaskCategory[] = [
    {
      title: 'Overdue',
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      tasks: categorizedTasks.overdue || [],
      description: getTaskDescription('overdue', categorizedTasks.overdue || [])
    },
    {
      title: 'Today',
      icon: Clock,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      tasks: categorizedTasks.today || [],
      description: getTaskDescription('today', categorizedTasks.today || [])
    },
    {
      title: 'Upcoming',
      icon: Calendar,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      tasks: categorizedTasks.upcoming || [],
      description: getTaskDescription('upcoming', categorizedTasks.upcoming || [])
    },
    {
      title: 'Draft',
      icon: FileText,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/10',
      tasks: categorizedTasks.draft || [],
      description: getTaskDescription('draft', categorizedTasks.draft || [])
    }
  ];

  // Show all categories, but collapse empty ones visually
  const hasAnyTasks = categories.some(category => category.tasks.length > 0);

  if (!hasAnyTasks) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <div className="text-slate-400">No tasks yet</div>
        <div className="text-slate-500 text-sm mt-1">
          Create your first task to get started
        </div>
      </div>
    );
  }

  return (
    <div className={LAYOUT_CONSTANTS.CARD_SPACING}>
      {categories.map((category) => (
        <div key={category.title} className="mb-6 last:mb-0">
          {/* Category Header */}
          <div className={layoutClasses(
            COMPONENT_PATTERNS.FLEX_START,
            'mb-3'
          )}>
            <div className={layoutClasses(
              'w-8 h-8 rounded-full flex items-center justify-center',
              category.bgColor
            )}>
              <category.icon className={`w-4 h-4 ${category.color}`} />
            </div>
            <div>
              <h4 className={layoutClasses(
                LAYOUT_CONSTANTS.TITLE_SMALL,
                'font-medium'
              )}>
                {category.title}
              </h4>
              <p className={layoutClasses(
                LAYOUT_CONSTANTS.SECONDARY_TEXT,
                LAYOUT_CONSTANTS.TEXT_SMALL
              )}>
                {category.description}
              </p>
            </div>
          </div>

          {/* Tasks */}
          {category.tasks.length > 0 ? (
            <div className={LAYOUT_CONSTANTS.CARD_SPACING_SMALL}>
              {category.tasks.map((task) => (
                <TaskTile
                  key={task.id}
                  task={task}
                  onEdit={() => onEdit(task)}
                  onTimer={() => onTimer(task)}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-400 text-sm border border-slate-700/30 rounded-xl bg-slate-800/20">
              No {category.title.toLowerCase()} tasks
            </div>
          )}
        </div>
      ))}
    </div>
  );
}