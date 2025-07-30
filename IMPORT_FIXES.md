# Import Fixes Required

The following imports need to be updated to remove version specifiers:

## Main Components
- `sonner@2.0.3` → `sonner`
- `next-themes@0.4.6` → `next-themes`
- `@radix-ui/react-*@x.x.x` → `@radix-ui/react-*`
- `class-variance-authority@0.7.1` → `class-variance-authority`
- `lucide-react@0.487.0` → `lucide-react`

## Files that need fixing:
1. `/components/GapUtilizationModal.tsx` - sonner import
2. `/components/ActivitiesContent.tsx` - sonner import
3. `/components/SettingsContent.tsx` - sonner import
4. `/components/CalendarSync.tsx` - sonner import
5. `/components/ActivitySchedulingModal.tsx` - sonner import
6. `/components/WidgetShare.tsx` - sonner import
7. All UI components in `/components/ui/` - radix-ui imports

## Command to fix these automatically:
```bash
# Find and replace versioned imports
find . -name "*.tsx" -not -path "./node_modules/*" -exec sed -i 's/@[0-9.]*"/"$/g' {} \;
```

After running this command, restart the development server.