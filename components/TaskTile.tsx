import { useRef, useState } from 'react';
import { Timer, Check, Trash2 } from 'lucide-react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { MinimizedTimerOnTask } from './MinimizedTimerOnTask';
import { Task } from '../types/index';
import { renderSafeIcon } from '../utils/helpers';

interface TaskTileProps {
  task: Task;
  onEdit: (task: Task) => void;
  onTimer: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onSchedule?: (task: Task) => void;
}

export function TaskTile({ task, onEdit, onTimer, onComplete, onDelete, onSchedule }: TaskTileProps) {
  const [swipeAction, setSwipeAction] = useState<'none' | 'complete' | 'delete'>('none');
  const x = useMotionValue(0);
  const hasDraggedRef = useRef(false);
  

  
  // Transform values for revealing actions
  const completeOpacity = useTransform(x, [0, 80], [0, 1]);
  const deleteOpacity = useTransform(x, [0, -80], [0, 1]);
  
  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 80;
    
    if (info.offset.x > threshold) {
      setSwipeAction('complete');
      x.set(80);
    } else if (info.offset.x < -threshold) {
      setSwipeAction('delete');
      x.set(-80);
    } else {
      setSwipeAction('none');
      x.set(0);
    }
  };

  const handleActionClick = (action: 'complete' | 'delete') => {
    if (action === 'complete') {
      onComplete(task);
    } else {
      onDelete(task.id);
    }
    setSwipeAction('none');
    x.set(0);
  };

  const getDateTimeDisplay = () => {
    if (!task.dueDate && !task.dueTime) {
      return { text: 'No due date', color: 'text-gray-400' };
    }
    
    const display = task.dueDate === 'Today' 
      ? `Today · ${task.dueTime}`
      : task.dueDate === 'Yesterday'
      ? `Yesterday · ${task.dueTime}`
      : `${task.dueDate} · ${task.dueTime}`;
    
    const color = task.status === 'overdue' ? 'text-red-400' : 'text-blue-300';
    
    return { text: display, color };
  };



  const dateTime = getDateTimeDisplay();

  const closeActions = () => {
    if (swipeAction !== 'none') {
      setSwipeAction('none');
      x.set(0);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      onClick={() => {
        // Clicking anywhere on the container (outside the action buttons)
        // should close the revealed actions
        closeActions();
      }}
    >
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        {/* Complete action (left side) */}
        <motion.div
          className="flex items-center justify-center bg-green-500 basis-20"
          style={{ opacity: completeOpacity }}
          onClick={(e) => {
            // Clicking the background (not the button) should close actions
            e.stopPropagation();
            closeActions();
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick('complete');
            }}
            className="p-2"
          >
            <Check className="w-5 h-5 text-white" />
          </button>
        </motion.div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Delete action (right side) */}
        <motion.div
          className="flex items-center justify-center bg-red-500 basis-20"
          style={{ opacity: deleteOpacity }}
          onClick={(e) => {
            // Clicking the background (not the button) should close actions
            e.stopPropagation();
            closeActions();
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick('delete');
            }}
            className="p-2"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      </div>

      {/* Main tile */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 80 }}
        dragElastic={0.1}
        onDragStart={() => {
          hasDraggedRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="bg-black/20 backdrop-blur-sm relative z-10 cursor-pointer w-full"
        onClick={(e) => {
          e.stopPropagation();
          // If actions are revealed, a click should close them instead of opening edit
          if (swipeAction !== 'none') {
            closeActions();
            return;
          }
          // If we've been dragging, suppress the click to avoid accidental edit
          if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
          }
          onEdit(task);
        }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 ${task.iconColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                  {renderSafeIcon(task.icon)}
                </div>
                <h3 className="font-semibold text-white truncate">{task.title}</h3>
              </div>
              <div className={`text-sm ${dateTime.color}`}>
                {dateTime.text}
              </div>
            </div>
            
            <div className="flex-shrink-0 ml-3">
              {task.isTimerRunning && task.timerRemaining !== undefined && task.timerTotal ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MinimizedTimerOnTask
                    duration={task.timerTotal}
                    elapsed={task.timerTotal - task.timerRemaining}
                    onClick={() => onTimer(task)}
                  />
                </div>
              ) : (
                <div 
                  className="w-8 h-8 flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTimer(task);
                  }}
                >
                  <Timer className="w-5 h-5 text-blue-300 hover:text-white transition-colors" />
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}