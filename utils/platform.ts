/**
 * Platform detection utilities
 * Provides platform-specific information and capabilities
 */

export interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isWeb: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  platform: 'ios' | 'android' | 'web' | 'unknown';
}

/**
 * Detect the current platform
 */
export function detectPlatform(): PlatformInfo {
  // Check if we're in a Capacitor environment
  const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;
  
  // Check for iOS using Capacitor device info if available
  let isIOS = false;
  let isAndroid = false;
  
  if (isCapacitor) {
    try {
      // Try to use Capacitor Device plugin for more accurate detection
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNative) {
        const userAgent = navigator.userAgent.toLowerCase();
        isIOS = userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod');
        isAndroid = userAgent.includes('android');
      } else {
        // Fallback to user agent detection
        const userAgent = navigator.userAgent.toLowerCase();
        isIOS = userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod');
        isAndroid = userAgent.includes('android');
      }
    } catch (error) {
      // Fallback to user agent detection
      const userAgent = navigator.userAgent.toLowerCase();
      isIOS = userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod');
      isAndroid = userAgent.includes('android');
    }
  }
  
  // Determine platform
  let platform: 'ios' | 'android' | 'web' | 'unknown' = 'unknown';
  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';
  else if (!isCapacitor) platform = 'web';
  
  // Determine if mobile
  const isMobile = isIOS || isAndroid || 
    (typeof window !== 'undefined' && window.innerWidth < 768);
  
  // Determine if desktop
  const isDesktop = !isMobile && platform === 'web';
  
  return {
    isIOS,
    isAndroid,
    isWeb: platform === 'web',
    isMobile,
    isDesktop,
    platform
  };
}

/**
 * Get platform-specific configuration
 */
export function getPlatformConfig() {
  const platform = detectPlatform();
  
  return {
    // iOS-specific settings
    ios: {
      enableDeviceCalendar: platform.isIOS,
      enableBackgroundRefresh: platform.isIOS,
      enableHapticFeedback: platform.isIOS,
    },
    
    // Android-specific settings
    android: {
      enableDeviceCalendar: platform.isAndroid,
      enableBackgroundSync: platform.isAndroid,
      enableVibration: platform.isAndroid,
    },
    
    // Web-specific settings
    web: {
      enableDeviceCalendar: false, // Web doesn't have device calendar access
      enableNotifications: platform.isWeb && 'Notification' in window,
      enableServiceWorker: platform.isWeb && 'serviceWorker' in navigator,
    }
  };
}

/**
 * Check if device calendar features are available
 */
export function isDeviceCalendarAvailable(): boolean {
  const platform = detectPlatform();
  return platform.isIOS || platform.isAndroid;
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(): string {
  const platform = detectPlatform();
  
  switch (platform.platform) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'web':
      return 'Web';
    default:
      return 'Unknown';
  }
}
