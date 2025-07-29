import { useEffect, useCallback } from 'react';

export function useMobileInteractions() {
  // Haptic feedback for touch interactions
  const triggerHapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' = 'light') => {
    // Check if the device supports haptic feedback
    if ('vibrate' in navigator) {
      switch (type) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(20);
          break;
        case 'heavy':
          navigator.vibrate([30, 10, 30]);
          break;
      }
    }
  }, []);

  // Enhanced button press with haptic feedback
  const handleButtonPress = useCallback((callback: () => void, hapticType: 'light' | 'medium' | 'heavy' = 'light') => {
    return () => {
      triggerHapticFeedback(hapticType);
      callback();
    };
  }, [triggerHapticFeedback]);

  // Long press detection
  const useLongPress = useCallback((callback: () => void, duration: number = 500) => {
    let timeout: NodeJS.Timeout;
    let startTime: number;

    return {
      onTouchStart: (e: React.TouchEvent) => {
        startTime = Date.now();
        timeout = setTimeout(() => {
          triggerHapticFeedback('medium');
          callback();
        }, duration);
      },
      onTouchEnd: () => {
        clearTimeout(timeout);
      },
      onTouchMove: () => {
        clearTimeout(timeout);
      }
    };
  }, [triggerHapticFeedback]);

  // Swipe gesture detection
  const useSwipeGesture = useCallback((
    onSwipeLeft?: () => void,
    onSwipeRight?: () => void,
    onSwipeUp?: () => void,
    onSwipeDown?: () => void,
    threshold: number = 50
  ) => {
    let startX: number;
    let startY: number;
    let startTime: number;

    return {
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
      },
      onTouchEnd: (e: React.TouchEvent) => {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const deltaTime = Date.now() - startTime;
        
        // Only register swipe if it was fast enough and long enough
        if (deltaTime < 300 && (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (deltaX > threshold && onSwipeRight) {
              triggerHapticFeedback('light');
              onSwipeRight();
            } else if (deltaX < -threshold && onSwipeLeft) {
              triggerHapticFeedback('light');
              onSwipeLeft();
            }
          } else {
            // Vertical swipe
            if (deltaY > threshold && onSwipeDown) {
              triggerHapticFeedback('light');
              onSwipeDown();
            } else if (deltaY < -threshold && onSwipeUp) {
              triggerHapticFeedback('light');
              onSwipeUp();
            }
          }
        }
      }
    };
  }, [triggerHapticFeedback]);

  // Pull to refresh detection
  const usePullToRefresh = useCallback((onRefresh: () => void, threshold: number = 80) => {
    let startY: number;
    let isPulling = false;

    return {
      onTouchStart: (e: React.TouchEvent) => {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        if (scrollTop === 0) {
          startY = e.touches[0].clientY;
          isPulling = true;
        }
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (isPulling) {
          const currentY = e.touches[0].clientY;
          const distance = currentY - startY;
          
          if (distance > threshold) {
            triggerHapticFeedback('medium');
            isPulling = false;
            onRefresh();
          }
        }
      },
      onTouchEnd: () => {
        isPulling = false;
      }
    };
  }, [triggerHapticFeedback]);

  // Screen wake lock to prevent screen from turning off during timers
  const useWakeLock = useCallback(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake lock activated');
        }
      } catch (err) {
        console.log('Wake lock failed:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLock) {
        try {
          await wakeLock.release();
          wakeLock = null;
          console.log('Wake lock released');
        } catch (err) {
          console.log('Wake lock release failed:', err);
        }
      }
    };

    return { requestWakeLock, releaseWakeLock };
  }, []);

  // Device orientation utilities
  const getDeviceOrientation = useCallback(() => {
    if (screen.orientation) {
      return screen.orientation.angle;
    }
    return window.orientation || 0;
  }, []);

  const isPortrait = useCallback(() => {
    const orientation = getDeviceOrientation();
    return orientation === 0 || orientation === 180;
  }, [getDeviceOrientation]);

  const isLandscape = useCallback(() => {
    return !isPortrait();
  }, [isPortrait]);

  // Network status detection
  const useNetworkStatus = useCallback(() => {
    const getNetworkStatus = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        return {
          online: navigator.onLine,
          effectiveType: connection?.effectiveType || 'unknown',
          downlink: connection?.downlink || 0,
          rtt: connection?.rtt || 0
        };
      }
      return { online: navigator.onLine };
    };

    return getNetworkStatus();
  }, []);

  // Battery status (where supported)
  const useBatteryStatus = useCallback(async () => {
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        return {
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime
        };
      }
    } catch (err) {
      console.log('Battery API not supported');
    }
    return null;
  }, []);

  return {
    triggerHapticFeedback,
    handleButtonPress,
    useLongPress,
    useSwipeGesture,
    usePullToRefresh,
    useWakeLock,
    getDeviceOrientation,
    isPortrait,
    isLandscape,
    useNetworkStatus,
    useBatteryStatus
  };
}