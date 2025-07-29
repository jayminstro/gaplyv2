import { useEffect, useState } from 'react';
import { useMobileInteractions } from '../hooks/useMobileInteractions';

export function MobileDeviceHandler() {
  const [deviceInfo, setDeviceInfo] = useState<{
    isIOS: boolean;
    isAndroid: boolean;
    isStandalone: boolean;
    hasNotch: boolean;
    supportsVibration: boolean;
    supportsWakeLock: boolean;
  }>({
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    hasNotch: false,
    supportsVibration: false,
    supportsWakeLock: false,
  });

  const { useWakeLock, useNetworkStatus } = useMobileInteractions();

  useEffect(() => {
    // Detect device type and capabilities
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
    
    // Detect devices with notch/safe area
    const hasNotch = window.screen.height / window.screen.width > 2 || 
                     CSS.supports('padding', 'env(safe-area-inset-top)');
    
    const supportsVibration = 'vibrate' in navigator;
    const supportsWakeLock = 'wakeLock' in navigator;

    setDeviceInfo({
      isIOS,
      isAndroid,
      isStandalone,
      hasNotch,
      supportsVibration,
      supportsWakeLock,
    });

    // Apply device-specific classes
    document.body.classList.add('mobile-device');
    if (isIOS) document.body.classList.add('ios-device');
    if (isAndroid) document.body.classList.add('android-device');
    if (isStandalone) document.body.classList.add('pwa-standalone');
    if (hasNotch) document.body.classList.add('device-has-notch');

    // Handle device-specific behaviors
    if (isIOS) {
      // iOS-specific optimizations
      document.body.style.webkitOverflowScrolling = 'touch';
      
      // Fix iOS viewport issues
      const fixiOSViewport = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };
      
      fixiOSViewport();
      window.addEventListener('resize', fixiOSViewport);
      window.addEventListener('orientationchange', () => {
        setTimeout(fixiOSViewport, 500);
      });
    }

    if (isAndroid) {
      // Android-specific optimizations
      document.body.style.overscrollBehavior = 'contain';
      
      // Handle Android back button
      const handleAndroidBack = (e: PopStateEvent) => {
        // Custom back button logic
        console.log('Android back button pressed');
      };
      
      window.addEventListener('popstate', handleAndroidBack);
    }

    // Handle app lifecycle events
    const handleAppStateChange = () => {
      if (document.visibilityState === 'visible') {
        // App came to foreground
        console.log('App resumed');
        // Refresh any stale data
        window.dispatchEvent(new CustomEvent('appResume'));
      } else {
        // App went to background
        console.log('App backgrounded');
        // Save any pending data
        window.dispatchEvent(new CustomEvent('appBackground'));
      }
    };

    document.addEventListener('visibilitychange', handleAppStateChange);

    // Network status monitoring
    const handleNetworkChange = () => {
      const isOnline = navigator.onLine;
      document.body.classList.toggle('app-offline', !isOnline);
      
      if (isOnline) {
        window.dispatchEvent(new CustomEvent('appOnline'));
      } else {
        window.dispatchEvent(new CustomEvent('appOffline'));
      }
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // Battery status monitoring (where supported)
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatteryStatus = () => {
          const isLowBattery = battery.level < 0.2;
          document.body.classList.toggle('low-battery', isLowBattery);
        };

        battery.addEventListener('levelchange', updateBatteryStatus);
        battery.addEventListener('chargingchange', updateBatteryStatus);
        updateBatteryStatus();
      }).catch(() => {
        // Battery API not supported
      });
    }

    // Memory pressure detection
    if ('memory' in performance) {
      const memoryInfo = (performance as any).memory;
      const isLowMemory = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit > 0.8;
      
      if (isLowMemory) {
        document.body.classList.add('low-memory');
        console.warn('Low memory detected');
      }
    }

    // Cleanup function
    return () => {
      document.body.classList.remove(
        'mobile-device',
        'ios-device',
        'android-device',
        'pwa-standalone',
        'device-has-notch'
      );
      
      document.removeEventListener('visibilitychange', handleAppStateChange);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, []);

  // Provide device info to child components via custom events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('deviceInfoReady', { 
      detail: deviceInfo 
    }));
  }, [deviceInfo]);

  return null; // This component doesn't render anything
}

// Export device info for other components to use
export function useDeviceInfo() {
  const [deviceInfo, setDeviceInfo] = useState<{
    isIOS: boolean;
    isAndroid: boolean;
    isStandalone: boolean;
    hasNotch: boolean;
    supportsVibration: boolean;
    supportsWakeLock: boolean;
  }>({
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    hasNotch: false,
    supportsVibration: false,
    supportsWakeLock: false,
  });

  useEffect(() => {
    const handleDeviceInfo = (e: CustomEvent) => {
      setDeviceInfo(e.detail);
    };

    window.addEventListener('deviceInfoReady', handleDeviceInfo as EventListener);
    
    return () => {
      window.removeEventListener('deviceInfoReady', handleDeviceInfo as EventListener);
    };
  }, []);

  return deviceInfo;
}