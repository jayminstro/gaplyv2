import { useState, useEffect } from 'react';
import { Star, Plus, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { CategorizedTasks } from "./CategorizedTasks";
import { EditTaskModal } from "./EditTaskModal";
import { NewTaskModal } from "./NewTaskModal";
import { Task } from '../types/index';
import { tasksAPIExtended, exploreAPI } from '../utils/api';
import { renderSafeIcon } from '../utils/helpers';
import { toast } from 'sonner';
import { ActivitySchedulingModal } from './ActivitySchedulingModal';
import { 
  LAYOUT_CONSTANTS, 
  COMPONENT_PATTERNS, 
  PageWrapper, 
  CardWrapper,
  layoutClasses 
} from '../utils/layout';

interface ActivitiesContentProps {
  globalTasks: Task[];
  setGlobalTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onTimerOpen: (task: Task) => void;
  onTimerUpdate: (task: Task, isRunning: boolean, remaining: number, total?: number) => Promise<void>;

  onTabChange: (tab: string) => void;
  editingTask: Task | null;
  setEditingTask: React.Dispatch<React.SetStateAction<Task | null>>;
  isNewTaskModalOpen: boolean;
  setIsNewTaskModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  localFirstService?: any; // Add localFirstService prop
}

export function ActivitiesContent({ 
  globalTasks, 
  setGlobalTasks, 
  onTimerOpen, 

  onTabChange,
  editingTask,
  setEditingTask,
  isNewTaskModalOpen,
  setIsNewTaskModalOpen,
  localFirstService
}: ActivitiesContentProps) {
  const [discoverData, setDiscoverData] = useState<any>({
    popular: [],
    categories: [],
    allActivities: []
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredActivities, setFilteredActivities] = useState<any[]>([]);
  const [schedulingActivity, setSchedulingActivity] = useState<any | null>(null);
  
  useEffect(() => {
    const loadDiscoverData = async () => {
      try {
        // Try to load from local storage first
        let activities: any[] = [];
        if (localFirstService) {
          console.log('📱 Loading activities from local storage...');
          try {
            activities = await localFirstService.getActivities();
            console.log('📱 Activities loaded from storage:', activities.length);
          } catch (error) {
            console.error('❌ Error loading activities from storage:', error);
            activities = [];
          }
        }

        // Load local data first for immediate display
        if (activities.length > 0) {
          console.log('📱 Using cached activities from local storage');
          updateDiscoverData(activities);
        }

        // Always fetch latest data from API
        try {
          console.log('🌐 Fetching latest activities from API...');
          const apiData = await exploreAPI.get();
          
          if (Array.isArray(apiData)) {
            console.log('🌐 API returned activities:', apiData.length);
            // For now, use API data directly since storage is having issues
            console.log('📱 Using API data directly due to storage issues');
            updateDiscoverData(apiData);
            
            // Try to save to local storage in background (don't block UI)
            if (localFirstService) {
              setTimeout(async () => {
                try {
                  console.log('💾 Attempting to save activities to local storage in background...');
                  await localFirstService.saveActivities(apiData);
                  console.log('✅ Activities saved to local storage successfully');
                } catch (storageError) {
                  console.error('❌ Background save failed:', storageError);
                }
              }, 1000);
            }
          } else {
            console.log('🌐 API returned non-array data:', apiData);
            // Use local data if available
            if (activities.length > 0) {
              console.log('📱 Using cached activities due to invalid API response');
              updateDiscoverData(activities);
            }
          }
        } catch (error) {
          console.error('⚠️ Error fetching activities:', error);
          // Continue using local data if available
          if (activities.length > 0) {
            console.log('📱 Continuing with cached activities');
            updateDiscoverData(activities);
          }
        }

        // Process activities data
        if (activities.length === 0) {
          console.log('📱 No activities available, showing empty state');
        }
        updateDiscoverData(activities);
      } catch (error) {
        console.error('Error loading discover data:', error);
        setDiscoverData({
          popular: [],
          categories: [
            { id: 'cat-1', title: 'Social', icon: 'Users', color: 'text-purple-400', count: 0 },
            { id: 'cat-2', title: 'Focus', icon: 'Target', color: 'text-green-400', count: 0 },
            { id: 'cat-3', title: 'Wellness', icon: 'Heart', color: 'text-pink-400', count: 0 },
            { id: 'cat-4', title: 'Learning', icon: 'BookOpen', color: 'text-blue-400', count: 0 },
          ],
          allActivities: []
        });
      }
    };

    loadDiscoverData();
  }, []);

  const updateDiscoverData = (activities: any[]) => {
    if (activities.length > 0) {
      const categoryCounts = {
        Social: activities.filter(a => a.category === 'Social').length,
        Focus: activities.filter(a => a.category === 'Focus').length,
        Wellness: activities.filter(a => a.category === 'Wellness').length,
        Learning: activities.filter(a => a.category === 'Learning').length,
      };

      setDiscoverData({
        popular: activities.slice(0, 3) || [],
        categories: [
          { id: 'cat-1', title: 'Social', icon: 'Users', color: 'text-purple-400', count: categoryCounts.Social },
          { id: 'cat-2', title: 'Focus', icon: 'Target', color: 'text-green-400', count: categoryCounts.Focus },
          { id: 'cat-3', title: 'Wellness', icon: 'Heart', color: 'text-pink-400', count: categoryCounts.Wellness },
          { id: 'cat-4', title: 'Learning', icon: 'BookOpen', color: 'text-blue-400', count: categoryCounts.Learning },
        ],
        allActivities: activities
      });
    } else {
      // Fallback to default structure if no data available
      setDiscoverData({
        popular: [],
        categories: [
          { id: 'cat-1', title: 'Social', icon: 'Users', color: 'text-purple-400', count: 0 },
          { id: 'cat-2', title: 'Focus', icon: 'Target', color: 'text-green-400', count: 0 },
          { id: 'cat-3', title: 'Wellness', icon: 'Heart', color: 'text-pink-400', count: 0 },
          { id: 'cat-4', title: 'Learning', icon: 'BookOpen', color: 'text-blue-400', count: 0 },
        ],
        allActivities: []
      });
    }
  };

  const handleCategoryClick = (categoryTitle: string) => {
    setSelectedCategory(categoryTitle);
    const activities = (discoverData.allActivities || []).filter(
      (activity: any) => activity.category === categoryTitle
    );
    setFilteredActivities(activities);
  };

  const handleBackToDiscover = () => {
    setSelectedCategory(null);
    setFilteredActivities([]);
  };

  const handleAddActivity = (activity: any) => {
    // Open the scheduling modal instead of directly creating a task
    setSchedulingActivity(activity);
  };

  const handleTaskCreated = async (newTask: Task) => {
    // Update the global tasks list
    const updatedTasks = [...globalTasks, newTask];
    setGlobalTasks(updatedTasks);
    await updateTasksInDatabase(updatedTasks);
  };
  
  const updateTasksInDatabase = async (tasks: Task[]) => {
    try {
      // Add updated_at timestamp to tasks that don't have it
      const tasksWithTimestamp = tasks.map(task => {
        if (!task.updated_at) {
          return {
            ...task,
            updated_at: new Date().toISOString()
          };
        }
        return task;
      });

      // Always save locally first
      if (localFirstService) {
        console.log('💾 [ActivitiesContent] Saving tasks locally:', {
          taskCount: tasksWithTimestamp.length,
          firstTask: tasksWithTimestamp[0] ? {
            id: tasksWithTimestamp[0].id,
            title: tasksWithTimestamp[0].title,
            status: tasksWithTimestamp[0].status
          } : null,
          allTaskIds: tasksWithTimestamp.map(t => t.id)
        });
        
        await localFirstService.saveTasks(tasksWithTimestamp);
        console.log('✅ [ActivitiesContent] Tasks saved locally');
      }

      // Try to save to server if online
      if (navigator.onLine) {
        try {
            // Save each task individually to preserve timestamps
            for (const task of tasksWithTimestamp) {
              if (task.id) {
                await tasksAPIExtended.updateWithTimestamp(task.id, task);
                console.log(`✅ [ActivitiesContent] Task ${task.id} saved to server`);
              } else {
                const result = await tasksAPIExtended.create(task);
                console.log(`✅ [ActivitiesContent] New task created on server:`, result);
              }
            }
        } catch (serverError) {
          console.warn('⚠️ [ActivitiesContent] Could not save to server (will sync later):', serverError);
          // Don't show error toast when offline - it's expected
          if (serverError instanceof Error && serverError.message !== 'Failed to fetch') {
            toast.error('Could not sync with server', {
              description: 'Changes are saved locally and will sync when online.',
            });
          }
        }
      }
      
    } catch (error) {
      console.error('❌ [ActivitiesContent] Error saving tasks:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        taskCount: tasks.length,
        tasks: tasks.map(t => ({ id: t.id, title: t.title }))
      });
      
      toast.error('Failed to save tasks', {
        description: 'Your changes may not be saved. Please try again.',
      });
      throw error;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 px-6 pt-2 pb-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-semibold mb-2 text-white">
            Activities
          </h1>
          <p className="text-slate-400 text-base">
            Discover and manage your activities
          </p>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto ios-scroll android-scroll no-bounce px-6 pt-2">
        <Tabs defaultValue="discover" className="w-full flex flex-col" onValueChange={onTabChange}>
          <TabsList className={layoutClasses(
            'w-full grid grid-cols-2 h-12',
            LAYOUT_CONSTANTS.CARD_BACKGROUND,
            LAYOUT_CONSTANTS.ROUNDED_LARGE
          )}>
            <TabsTrigger 
              value="discover" 
              className={layoutClasses(
                'text-slate-400',
                'data-[state=active]:text-white data-[state=active]:bg-slate-700/50',
                LAYOUT_CONSTANTS.ROUNDED_MEDIUM,
                'transition-all duration-200',
                'h-full'
              )}
            >
              Discover
            </TabsTrigger>
            <TabsTrigger 
              value="my-activities"
              className={layoutClasses(
                'text-slate-400',
                'data-[state=active]:text-white data-[state=active]:bg-slate-700/50',
                LAYOUT_CONSTANTS.ROUNDED_MEDIUM,
                'transition-all duration-200',
                'h-full'
              )}
            >
              My Activities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="mt-4 flex-1 outline-none">
            <div className={LAYOUT_CONSTANTS.CARD_SPACING}>
              {selectedCategory ? (
                // Category filtered view
                <div className={LAYOUT_CONSTANTS.CARD_SPACING}>
                  {/* Back button and category header */}
                  <div className={layoutClasses(COMPONENT_PATTERNS.FLEX_START, LAYOUT_CONSTANTS.SECTION_MARGIN_BOTTOM_SMALL)}>
                    <button
                      onClick={handleBackToDiscover}
                      className={layoutClasses(
                        'p-2',
                        LAYOUT_CONSTANTS.ROUNDED_MEDIUM,
                        LAYOUT_CONSTANTS.CARD_BACKGROUND,
                        LAYOUT_CONSTANTS.HOVER_BACKGROUND
                      )}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className={layoutClasses(LAYOUT_CONSTANTS.TITLE_MEDIUM, 'font-medium')}>
                        {selectedCategory}
                      </h3>
                      <p className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT, LAYOUT_CONSTANTS.TEXT_SMALL)}>
                        {filteredActivities.length} activities
                      </p>
                    </div>
                  </div>

                  {/* Filtered activities */}
                  <div className={layoutClasses(LAYOUT_CONSTANTS.CARD_SPACING_SMALL, 'scroll-smooth ios-scroll android-scroll')} data-scrollable="true">
                    {(filteredActivities || []).map((activity: any) => (
                      <CardWrapper key={activity.id}>
                        <div className={COMPONENT_PATTERNS.FLEX_BETWEEN}>
                          <div className={layoutClasses(COMPONENT_PATTERNS.FLEX_START, 'flex-1')}>
                            <div className={layoutClasses(
                              'w-10 h-10 rounded-full flex items-center justify-center',
                              activity.color
                            )}>
                              {renderSafeIcon(activity.icon)}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{activity.title}</div>
                              <div className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT, LAYOUT_CONSTANTS.TEXT_SMALL)}>
                                {activity.category} • {activity.duration} min
                              </div>
                            </div>
                          </div>
                          <div className={COMPONENT_PATTERNS.FLEX_START}>
                            <div className="flex items-center gap-2">
                              <div className={layoutClasses('text-yellow-400 ' + LAYOUT_CONSTANTS.TEXT_SMALL)}>
                                {activity.rating}
                              </div>
                              <Star className="w-4 h-4 text-yellow-400 fill-current" />
                            </div>
                            <button
                              onClick={() => handleAddActivity(activity)}
                              className={layoutClasses(
                                'px-3 py-1.5',
                                LAYOUT_CONSTANTS.PRIMARY_BUTTON,
                                LAYOUT_CONSTANTS.ROUNDED_SMALL,
                                LAYOUT_CONSTANTS.TEXT_SMALL,
                                'transition-colors'
                              )}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </CardWrapper>
                    ))}
                  </div>
                </div>
              ) : (
                // Main discover view
                <div className={LAYOUT_CONSTANTS.CARD_SPACING}>
                  {/* Popular Activities */}
                  <div>
                    <h3 className={layoutClasses(
                      LAYOUT_CONSTANTS.TITLE_SMALL,
                      'mb-3 flex items-center gap-2'
                    )}>
                      <Star className="w-5 h-5 text-yellow-400" />
                      Popular
                    </h3>
                    <div className={LAYOUT_CONSTANTS.CARD_SPACING_SMALL}>
                      {(discoverData.popular || []).map((activity: any) => (
                        <CardWrapper key={activity.id}>
                          <div className={COMPONENT_PATTERNS.FLEX_BETWEEN}>
                            <div className={layoutClasses(COMPONENT_PATTERNS.FLEX_START, 'flex-1')}>
                              <div className={layoutClasses(
                                'w-10 h-10 rounded-full flex items-center justify-center',
                                activity.color
                              )}>
                                {renderSafeIcon(activity.icon)}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">{activity.title}</div>
                                <div className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT + ' ' + LAYOUT_CONSTANTS.TEXT_SMALL)}>
                                  {activity.category} • {activity.duration} min
                                </div>
                              </div>
                            </div>
                            <div className={COMPONENT_PATTERNS.FLEX_START}>
                              <div className="flex items-center gap-2">
                                <div className={layoutClasses('text-yellow-400', LAYOUT_CONSTANTS.TEXT_SMALL)}>
                                  {activity.rating}
                                </div>
                                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                              </div>
                              <button
                                onClick={() => handleAddActivity(activity)}
                                className={layoutClasses(
                                  'px-3 py-1.5',
                                  LAYOUT_CONSTANTS.PRIMARY_BUTTON,
                                  LAYOUT_CONSTANTS.ROUNDED_SMALL,
                                  LAYOUT_CONSTANTS.TEXT_SMALL,
                                  'transition-colors'
                                )}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </CardWrapper>
                      ))}
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <h3 className={layoutClasses(LAYOUT_CONSTANTS.TITLE_SMALL, 'mb-3')}>Categories</h3>
                    <div className={COMPONENT_PATTERNS.GRID_2_COLS}>
                      {(discoverData.categories || []).map((category: any) => (
                        <button
                          key={category.id}
                          onClick={() => handleCategoryClick(category.title)}
                          className={layoutClasses(
                            LAYOUT_CONSTANTS.CARD_BACKGROUND,
                            LAYOUT_CONSTANTS.ROUNDED_LARGE,
                            'p-4 text-center cursor-pointer',
                            LAYOUT_CONSTANTS.HOVER_BACKGROUND,
                            'transition-colors'
                          )}
                        >
                          {renderSafeIcon(category.icon)}
                          <div className="font-medium">{category.title}</div>
                          <div className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT + ' ' + LAYOUT_CONSTANTS.TEXT_SMALL)}>
                            {category.count} activities
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="my-activities" className="mt-4 flex-1 outline-none">
            <div className={LAYOUT_CONSTANTS.CARD_SPACING}>
              <div className={COMPONENT_PATTERNS.FLEX_BETWEEN}>
                <h3 className={LAYOUT_CONSTANTS.TITLE_SMALL}>Your tasks</h3>
                <Button 
                  onClick={() => setIsNewTaskModalOpen(true)}
                  className={layoutClasses(
                    LAYOUT_CONSTANTS.PRIMARY_BUTTON,
                    LAYOUT_CONSTANTS.ROUNDED_MEDIUM
                  )}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add task
                </Button>
              </div>
              
              <CategorizedTasks
                tasks={globalTasks || []}
                onEdit={(task) => setEditingTask(task)}
                onTimer={(task) => onTimerOpen(task)}
                onComplete={(task) => {
                  const updatedTasks = globalTasks.filter(t => t.id !== task.id);
                  setGlobalTasks(updatedTasks);
                  updateTasksInDatabase(updatedTasks);
                }}
                onDelete={(taskId) => {
                  const updatedTasks = globalTasks.filter(t => t.id !== taskId);
                  setGlobalTasks(updatedTasks);
                  updateTasksInDatabase(updatedTasks);
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Edit Task Modal */}
        <EditTaskModal
          task={editingTask}
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(updatedTask) => {
            // Add updated_at timestamp when task is modified
            const taskWithTimestamp = {
              ...updatedTask,
              updated_at: new Date().toISOString()
            };
            const updatedTasks = globalTasks.map(t => 
              t.id === taskWithTimestamp.id ? taskWithTimestamp : t
            );
            setGlobalTasks(updatedTasks);
            updateTasksInDatabase(updatedTasks);
            setEditingTask(null);
          }}
        />

        {/* New Task Modal */}
        <NewTaskModal
          isOpen={isNewTaskModalOpen}
          onClose={() => setIsNewTaskModalOpen(false)}
          onCreate={(newTask) => {
            // Add timestamps for new tasks
            const taskWithTimestamps = {
              ...newTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as Task;
            const updatedTasks = [...globalTasks, taskWithTimestamps];
            setGlobalTasks(updatedTasks);
            updateTasksInDatabase(updatedTasks);
            setIsNewTaskModalOpen(false);
          }}
        />

        {/* Activity Scheduling Modal */}
        <ActivitySchedulingModal
          isOpen={!!schedulingActivity}
          onClose={() => setSchedulingActivity(null)}
          activity={schedulingActivity}
          onTaskCreated={handleTaskCreated}
        />
      </div>
    </div>
  );
}