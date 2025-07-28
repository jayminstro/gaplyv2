// Layout standardization utilities for consistent spacing and design patterns

export const LAYOUT_CONSTANTS = {
  // Page padding - standardized across all content areas
  PAGE_PADDING: 'px-6 py-12',
  
  // Content area padding - for main sections
  CONTENT_PADDING: 'px-6 py-8',
  
  // Section margins - consistent spacing between major sections
  SECTION_MARGIN_BOTTOM: 'mb-8',
  SECTION_MARGIN_BOTTOM_SMALL: 'mb-6',
  
  // Header margins
  HEADER_MARGIN_BOTTOM: 'mb-8',
  TITLE_MARGIN_BOTTOM: 'mb-2',
  SUBTITLE_MARGIN_BOTTOM: 'mb-4',
  
  // Card/component spacing
  CARD_SPACING: 'space-y-4',
  CARD_SPACING_SMALL: 'space-y-3',
  FORM_SPACING: 'space-y-5',
  FORM_SPACING_SMALL: 'space-y-4',
  
  // Grid gaps
  GRID_GAP: 'gap-4',
  GRID_GAP_SMALL: 'gap-3',
  
  // Border radius - consistent rounded corners
  ROUNDED_LARGE: 'rounded-2xl',
  ROUNDED_MEDIUM: 'rounded-xl',
  ROUNDED_SMALL: 'rounded-lg',
  
  // Background styles
  CARD_BACKGROUND: 'bg-slate-800/60 backdrop-blur-sm border border-slate-700/50',
  MODAL_BACKGROUND: 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800',
  INPUT_BACKGROUND: 'bg-slate-800/50 border-slate-600',
  
  // Text colors
  PRIMARY_TEXT: 'text-white',
  SECONDARY_TEXT: 'text-slate-400',
  ACCENT_TEXT: 'text-blue-400',
  ERROR_TEXT: 'text-red-400',
  SUCCESS_TEXT: 'text-green-400',
  
  // Button styles
  PRIMARY_BUTTON: 'bg-blue-600 hover:bg-blue-700 text-white',
  SECONDARY_BUTTON: 'bg-slate-700 hover:bg-slate-600 text-white',
  OUTLINE_BUTTON: 'bg-slate-700/50 border-slate-600 hover:bg-slate-600/50',
  
  // Interactive states
  HOVER_SCALE: 'hover:opacity-80 transition-opacity',
  HOVER_BACKGROUND: 'hover:bg-slate-700/60 transition-colors',
  ACTIVE_STATE: 'active:scale-95 transition-transform',
  
  // Loading states
  LOADING_OPACITY: 'opacity-50 pointer-events-none',
  
  // Typography hierarchy
  TITLE_LARGE: 'text-3xl',
  TITLE_MEDIUM: 'text-xl',
  TITLE_SMALL: 'text-lg',
  TEXT_BASE: 'text-base',
  TEXT_SMALL: 'text-sm',
  TEXT_TINY: 'text-xs',
  
  // Safe area handling for mobile
  SAFE_AREA_TOP: 'safe-area-top',
  SAFE_AREA_BOTTOM: 'safe-area-bottom',
  SAFE_AREA_LEFT: 'safe-area-left',
  SAFE_AREA_RIGHT: 'safe-area-right',
};

// Component layout patterns
export const COMPONENT_PATTERNS = {
  // Page header pattern
  PAGE_HEADER: `${LAYOUT_CONSTANTS.HEADER_MARGIN_BOTTOM}`,
  
  // Modal header pattern
  MODAL_HEADER: 'text-center mb-6',
  
  // Form layout pattern
  FORM_CONTAINER: `${LAYOUT_CONSTANTS.FORM_SPACING}`,
  
  // Card layout pattern
  CARD_CONTAINER: `${LAYOUT_CONSTANTS.CARD_BACKGROUND} ${LAYOUT_CONSTANTS.ROUNDED_LARGE} p-4 ${LAYOUT_CONSTANTS.HOVER_BACKGROUND}`,
  
  // Button group pattern
  BUTTON_GROUP: 'flex gap-3',
  BUTTON_GROUP_VERTICAL: 'flex flex-col gap-3',
  
  // Grid layout patterns
  GRID_2_COLS: 'grid grid-cols-2 gap-3',
  GRID_3_COLS: 'grid grid-cols-3 gap-3',
  GRID_AUTO: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
  
  // Flex patterns
  FLEX_BETWEEN: 'flex items-center justify-between',
  FLEX_CENTER: 'flex items-center justify-center',
  FLEX_START: 'flex items-center gap-3',
};

// Responsive breakpoints
export const BREAKPOINTS = {
  SM: 'sm:',
  MD: 'md:',
  LG: 'lg:',
  XL: 'xl:',
};

// Animation patterns
export const ANIMATIONS = {
  FADE_IN: 'animate-in fade-in duration-200',
  SLIDE_IN: 'animate-in slide-in-from-bottom duration-300',
  BOUNCE_IN: 'animate-bounce',
  PULSE: 'animate-pulse',
};

// Helper function to combine classes with layout constants
export const layoutClasses = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// Page wrapper component for consistent layout
export const PageWrapper = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={layoutClasses(LAYOUT_CONSTANTS.PAGE_PADDING, className)}>
    {children}
  </div>
);

// Section wrapper for consistent spacing
export const SectionWrapper = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={layoutClasses(LAYOUT_CONSTANTS.SECTION_MARGIN_BOTTOM, className)}>
    {children}
  </div>
);

// Card wrapper for consistent card styling
export const CardWrapper = ({ children, onClick, className = '' }: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string; 
}) => (
  <div 
    className={layoutClasses(COMPONENT_PATTERNS.CARD_CONTAINER, onClick && 'cursor-pointer', className)}
    onClick={onClick}
  >
    {children}
  </div>
);