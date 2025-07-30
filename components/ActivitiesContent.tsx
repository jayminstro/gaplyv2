import { useState, useEffect } from 'react';
import { 
  Star, Users, Heart, Brain, Target, Plus, ArrowLeft, 
  Phone, MessageCircle, Share2, Calendar, FolderOpen, 
  CheckSquare, Shield, Wind, Activity, MapPin, Droplets, 
  BookOpen, Play, Zap, PenTool 
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { TaskTile } from "./TaskTile";
import { CategorizedTasks } from "./CategorizedTasks";
import { EditTaskModal } from "./EditTaskModal";
import { NewTaskModal } from "./NewTaskModal";
import { Task } from '../types/index';
import { tasksAPI, exploreAPI } from '../utils/api';
import { renderSafeIcon } from '../utils/helpers';
import { toast } from 'sonner';
import { ActivitySchedulingModal } from './ActivitySchedulingModal';
import { 
  LAYOUT_CONSTANTS, 
  COMPONENT_PATTERNS, 
  PageWrapper, 
  SectionWrapper,
  CardWrapper,
  layoutClasses 
} from '../utils/layout';

interface ActivitiesContentProps {
  globalTasks: Task[];
  setGlobalTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onTimerOpen: (task: Task) => void;
  onTimerUpdate: (task: Task, isRunning: boolean, remaining: number, total?: number) => void;
  onTabChange: (tab: string) => void;
  editingTask: Task | null;
  setEditingTask: React.Dispatch<React.SetStateAction<Task | null>>;
  isNewTaskModalOpen: boolean;
  setIsNewTaskModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ActivitiesContent({ 
  globalTasks, 
  setGlobalTasks, 
  onTimerOpen, 
  onTimerUpdate,
  onTabChange,
  editingTask,
  setEditingTask,
  isNewTaskModalOpen,
  setIsNewTaskModalOpen
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
        const data = await exploreAPI.get();
        
        // Handle different data structures from the API
        if (Array.isArray(data)) {
          // If data is an array (from explore table), convert to expected structure
          setDiscoverData({
            popular: data.slice(0, 3) || [],
            categories: [
              { id: 'cat-1', title: 'Social', icon: 'Users', color: 'text-purple-400', count: data.filter(a => a.category === 'Social').length },
              { id: 'cat-2', title: 'Focus', icon: 'Target', color: 'text-green-400', count: data.filter(a => a.category === 'Focus').length },
              { id: 'cat-3', title: 'Wellness', icon: 'Heart', color: 'text-pink-400', count: data.filter(a => a.category === 'Wellness').length },
              { id: 'cat-4', title: 'Learning', icon: 'BookOpen', color: 'text-blue-400', count: data.filter(a => a.category === 'Learning').length },
            ],
            allActivities: data || []
          });
        } else if (data && typeof data === 'object') {
          // If data has expected structure
          setDiscoverData({
            popular: data.popular || [],
            categories: data.categories || [],
            allActivities: data.allActivities || []
          });
        } else {
          // Fallback to default structure
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
      console.log('💾 [ActivitiesContent] Saving tasks to database:', {
        taskCount: tasks.length,
        firstTask: tasks[0] ? {
          id: tasks[0].id,
          title: tasks[0].title,
          status: tasks[0].status
        } : null,
        allTaskIds: tasks.map(t => t.id)
      });
      
      const result = await tasksAPI.save(tasks);
      console.log('✅ [ActivitiesContent] Tasks saved successfully:', result);
      
      // Verify the save by fetching the data back
      try {
        const savedTasks = await tasksAPI.get();
        console.log('🔍 [ActivitiesContent] Verification: Retrieved tasks after save:', {
          savedCount: savedTasks.length,
          savedIds: savedTasks.map(t => t.id)
        });
      } catch (verificationError) {
        console.error('⚠️ [ActivitiesContent] Could not verify save:', verificationError);
      }
      
    } catch (error) {
      console.error('❌ [ActivitiesContent] Error saving tasks to database:', {
        error,
        errorMessage: error.message,
        taskCount: tasks.length,
        tasks: tasks.map(t => ({ id: t.id, title: t.title }))
      });
      
      toast.error('Failed to save tasks', {
        description: 'Your changes may not be saved. Please try again.',
      });
      throw error; // Re-throw to let caller handle if needed
    }
  };

  return (
    <PageWrapper className="pb-4">
      <div className={LAYOUT_CONSTANTS.SECTION_MARGIN_BOTTOM}>
        <h1 className={layoutClasses(LAYOUT_CONSTANTS.TITLE_LARGE, LAYOUT_CONSTANTS.TITLE_MARGIN_BOTTOM)}>
          Activities
        </h1>
        <p className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT, LAYOUT_CONSTANTS.TEXT_BASE)}>
          Discover and manage your activities
        </p>
      </div>

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
                            {renderSafeIcon(activity.icon, 'w-5 h-5')}
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
                              {renderSafeIcon(activity.icon, 'w-5 h-5')}
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
                        {renderSafeIcon(category.icon, `w-8 h-8 mx-auto mb-2 ${category.color}`)}
                        <div className="font-medium">{category.title}</div>
                        <div className={layoutClasses(LAYOUT_CONSTANTS.SECONDARY_TEXT, LAYOUT_CONSTANTS.TEXT_SMALL)}>
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
          const updatedTasks = globalTasks.map(t => 
            t.id === updatedTask.id ? updatedTask : t
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
          const updatedTasks = [...globalTasks, newTask as Task];
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
    </PageWrapper>
  );
}