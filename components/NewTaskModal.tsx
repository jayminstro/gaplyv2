import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { User, Briefcase, Heart, BookOpen, Home, Zap, ZapOff, Battery } from 'lucide-react';
import { Task } from '../types/index';
import { generateUUID } from '../utils/uuid';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: Partial<Task>) => void;
}

export function NewTaskModal({ isOpen, onClose, onCreate }: NewTaskModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    notes: '',
    duration: '',
    category: '',
    energyLevel: '',
    dueDate: '',
    dueTime: '',
    reminderDate: '',
    reminderTime: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      title: '',
      notes: '',
      duration: '',
      category: '',
      energyLevel: '',
      dueDate: '',
      dueTime: '',
      reminderDate: '',
      reminderTime: '',
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!formData.duration) {
      newErrors.duration = 'Duration is required';
    }
    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    if (!formData.energyLevel) {
      newErrors.energyLevel = 'Energy level is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = () => {
    if (!validateForm()) return;

    const categoryColors = {
      Personal: 'text-purple-400',
      Work: 'text-blue-400',
      Health: 'text-red-400',
      Learning: 'text-green-400',
      Chores: 'text-orange-400'
    };

    const newTask: Partial<Task> = {
      id: generateUUID(),
      title: formData.title,
      notes: formData.notes,
      duration: formData.duration,
      category: formData.category,
      energyLevel: formData.energyLevel,
      dueDate: formData.dueDate || undefined,
      dueTime: formData.dueTime || undefined,
      reminderDate: formData.reminderDate || undefined,
      reminderTime: formData.reminderTime || undefined,
      status: (formData.dueDate && formData.dueTime) ? 'scheduled' : 'draft' as const,
      icon: formData.category, // Store icon as string identifier
      iconColor: categoryColors[formData.category as keyof typeof categoryColors],
    };

    onCreate(newTask);
    resetForm();
    onClose();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const categoryIcons = {
    Personal: <User className="w-4 h-4" />,
    Work: <Briefcase className="w-4 h-4" />,
    Health: <Heart className="w-4 h-4" />,
    Learning: <BookOpen className="w-4 h-4" />,
    Chores: <Home className="w-4 h-4" />
  };

  const energyIcons = {
    High: <Zap className="w-4 h-4" />,
    Medium: <Battery className="w-4 h-4" />,
    Low: <ZapOff className="w-4 h-4" />
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-white border-0 max-w-md mx-auto p-6 rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center mb-6">
          <DialogTitle className="text-xl font-semibold mb-2 text-white">
            Create New Task
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            Add a new task with all the details you need
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-slate-300 font-medium text-sm mb-2 block">
              Title <span className="text-red-400">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-400 rounded-xl h-11"
              placeholder="Enter task title"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-slate-300 font-medium text-sm mb-2 block">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-400 rounded-xl min-h-20 resize-none"
              placeholder="Add notes (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Duration */}
            <div>
              <Label htmlFor="duration" className="text-slate-300 font-medium text-sm mb-2 block">
                Duration <span className="text-red-400">*</span>
              </Label>
              <Input
                id="duration"
                type="time"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-blue-400 rounded-xl h-11"
                placeholder="HH:MM"
              />
              {errors.duration && <p className="text-red-400 text-xs mt-1">{errors.duration}</p>}
            </div>

            {/* Energy Level */}
            <div>
              <Label htmlFor="energyLevel" className="text-slate-300 font-medium text-sm mb-2 block">
                Energy <span className="text-red-400">*</span>
              </Label>
              <Select value={formData.energyLevel} onValueChange={(value) => setFormData({ ...formData, energyLevel: value })}>
                <SelectTrigger className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 rounded-xl">
                  <SelectItem value="High">
                    <div className="flex items-center gap-2">
                      {energyIcons.High}
                      High
                    </div>
                  </SelectItem>
                  <SelectItem value="Medium">
                    <div className="flex items-center gap-2">
                      {energyIcons.Medium}
                      Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="Low">
                    <div className="flex items-center gap-2">
                      {energyIcons.Low}
                      Low
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.energyLevel && <p className="text-red-400 text-xs mt-1">{errors.energyLevel}</p>}
            </div>
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category" className="text-slate-300 font-medium text-sm mb-2 block">
              Category <span className="text-red-400">*</span>
            </Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 rounded-xl">
                {Object.entries(categoryIcons).map(([category, icon]) => (
                  <SelectItem key={category} value={category}>
                    <div className="flex items-center gap-2">
                      {icon}
                      {category}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category}</p>}
          </div>

          {/* Due Date & Time */}
          <div>
            <Label className="text-slate-300 font-medium text-sm mb-2 block">Due Date & Time</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11"
              />
              <Input
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11"
              />
            </div>
          </div>

          {/* Reminder */}
          <div>
            <Label className="text-slate-300 font-medium text-sm mb-2 block">Reminder</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={formData.reminderDate}
                onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })}
                className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11"
              />
              <Input
                type="time"
                value={formData.reminderTime}
                onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })}
                className="bg-slate-800/60 border-slate-600/50 text-white rounded-xl h-11"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 mt-6 border-t border-slate-700/50">
          <Button 
            variant="outline" 
            onClick={handleClose} 
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700/50 rounded-xl h-11"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl h-11 shadow-lg"
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}