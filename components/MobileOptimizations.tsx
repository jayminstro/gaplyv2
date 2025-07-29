import { useEffect } from 'react';

export function MobileOptimizations() {
  useEffect(() => {
    // Add viewport meta tag for mobile optimization
    const existingViewport = document.querySelector('meta[name="viewport"]');
    if (!existingViewport) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
      document.getElementsByTagName('head')[0].appendChild(meta);
    } else {
      existingViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }

    // Add mobile app meta tags
    const addMetaTag = (name: string, content: string) => {
      const existing = document.querySelector(`meta[name="${name}"]`);
      if (!existing) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.getElementsByTagName('head')[0].appendChild(meta);
      }
    };

    // PWA and mobile app meta tags
    addMetaTag('apple-mobile-web-app-capable', 'yes');
    addMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent');
    addMetaTag('apple-mobile-web-app-title', 'Gaply');
    addMetaTag('mobile-web-app-capable', 'yes');
    addMetaTag('theme-color', '#0f172a');
    addMetaTag('apple-touch-fullscreen', 'yes');
    addMetaTag('format-detection', 'telephone=no');
    addMetaTag('msapplication-tap-highlight', 'no');

    // Add link tags for PWA
    const addLinkTag = (rel: string, href: string, sizes?: string) => {
      const existing = document.querySelector(`link[rel="${rel}"]`);
      if (!existing) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        if (sizes) link.setAttribute('sizes', sizes);
        document.head.appendChild(link);
      }
    };

    addLinkTag('apple-touch-icon', '/apple-touch-icon.png', '180x180');
    addLinkTag('icon', '/favicon-32x32.png', '32x32');
    addLinkTag('icon', '/favicon-16x16.png', '16x16');
    addLinkTag('manifest', '/manifest.json');

    // Enhanced touch scrolling support
    let isScrolling = false;
    let touchStartY = 0;
    let touchStartX = 0;

    // Prevent pull-to-refresh on mobile with enhanced detection
    const preventPullToRefresh = (e: TouchEvent) => {
      const element = e.target as HTMLElement;
      const scrollableParent = element.closest('[data-scrollable]') || 
                               element.closest('.overflow-y-auto') || 
                               element.closest('.overflow-auto');
      
      // If inside a scrollable container, allow normal scrolling
      if (scrollableParent) {
        return;
      }
      
      const isAtTop = document.documentElement.scrollTop === 0 || 
                      document.body.scrollTop === 0;
      
      if (isAtTop && e.touches.length === 1) {
        const deltaY = e.touches[0].clientY - touchStartY;
        
        // Only prevent if pulling down from the top
        if (deltaY > 0) {
          e.preventDefault();
        }
      }
    };

    // Enhanced touch start handler
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isScrolling = false;
      }
    };

    // Enhanced touch move handler for smooth scrolling
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        
        // Determine if user is scrolling
        if (!isScrolling && (deltaY > 5 || deltaX > 5)) {
          isScrolling = true;
        }
        
        // Enhanced pull-to-refresh prevention
        preventPullToRefresh(e);
      }
    };

    // Add enhanced touch event listeners
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Prevent double-tap zoom with better detection
    let lastTouchEnd = 0;
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

    // Enhanced mobile styling and touch optimization
    const style = document.createElement('style');
    style.textContent = `
      /* Prevent iOS text size adjustment */
      html {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        height: 100%;
        overflow-x: hidden;
      }
      
      /* Enhanced body styling for mobile */
      body {
        height: 100%;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: none;
        overscroll-behavior-y: none;
        /* Mobile keyboard handling */
        position: fixed;
        width: 100%;
      }
      
      /* Root container styling */
      #root {
        height: 100%;
        overflow-x: hidden;
      }
      
      /* Better touch targets for mobile */
      button, [role="button"], input, select, textarea {
        min-height: 44px;
        min-width: 44px;
      }
      
      /* Enhanced smooth scrolling for all elements */
      * {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      
      /* Scrollable containers get special treatment */
      .overflow-y-auto, .overflow-auto, [data-scrollable] {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        overscroll-behavior-y: contain;
        scroll-behavior: smooth;
      }
      
      /* Modal scrolling areas */
      .modal-content, .modal-scrollable {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        overscroll-behavior-y: contain;
        scroll-behavior: smooth;
      }
      
      /* Hide selection highlights on touch */
      * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      /* Allow text selection for inputs and text areas */
      input, textarea, [contenteditable] {
        -webkit-user-select: text;
        -khtml-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
      }
      
      /* Prevent text selection on buttons */
      button {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      
      /* Enhanced focus styles for mobile accessibility */
      button:focus, [role="button"]:focus, input:focus, select:focus, textarea:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }
      
      /* Touch-friendly button states */
      button:active, [role="button"]:active {
        transform: scale(0.98);
        transition: transform 0.1s ease;
      }
      
      /* Enhanced momentum scrolling */
      .scroll-smooth {
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
      }
      
      /* Prevent rubber band scrolling on iOS */
      .no-bounce {
        overscroll-behavior: none;
        overscroll-behavior-y: none;
      }
      
      /* Safe area handling for devices with notches */
      @supports (padding: max(0px)) {
        .safe-area-top {
          padding-top: max(1rem, env(safe-area-inset-top));
        }
        
        .safe-area-bottom {
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }
        
        .safe-area-left {
          padding-left: max(1rem, env(safe-area-inset-left));
        }
        
        .safe-area-right {
          padding-right: max(1rem, env(safe-area-inset-right));
        }
      }
      
      /* iOS specific optimizations */
      @supports (-webkit-touch-callout: none) {
        .ios-scroll {
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        
        /* Fix for iOS scroll momentum issues */
        .ios-scroll::-webkit-scrollbar {
          display: none;
        }
      }
      
      /* Android specific optimizations */
      @supports not (-webkit-touch-callout: none) {
        .android-scroll {
          scroll-behavior: smooth;
          overscroll-behavior: contain;
        }
      }
    `;
    document.head.appendChild(style);

    // Enhanced scroll event handling for performance
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          // Handle any scroll-based animations or updates here
          ticking = false;
        });
        ticking = true;
      }
    };

    // Add optimized scroll listener
    document.addEventListener('scroll', handleScroll, { passive: true });

    // Handle app installation prompt
    let deferredPrompt: any = null;
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      // You can show a custom install button here
      console.log('App install prompt available');
    };

    // Handle app installation
    const handleAppInstalled = () => {
      console.log('App was installed');
      deferredPrompt = null;
    };

    // Add PWA event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Handle screen orientation changes
    const handleOrientationChange = () => {
      // Force viewport recalculation
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      }
    };

    // Add orientation change listener
    window.addEventListener('orientationchange', handleOrientationChange);

    // Handle app state changes (when app comes back from background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // App came back to foreground
        console.log('App resumed from background');
        // Trigger any necessary refreshes
        window.dispatchEvent(new Event('appresume'));
      } else {
        // App went to background
        console.log('App went to background');
        window.dispatchEvent(new Event('appbackground'));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Prevent context menu on long press (mobile)
    const preventContextMenu = (e: Event) => {
      if (e.type === 'contextmenu') {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', preventContextMenu);

    // Handle hardware back button (Android)
    const handleBackButton = (e: PopStateEvent) => {
      // Custom back button handling can be added here
      console.log('Hardware back button pressed');
    };

    window.addEventListener('popstate', handleBackButton);

    // Handle mobile keyboard events
    const handleKeyboardOpen = () => {
      // Add class when keyboard is open
      document.body.classList.add('keyboard-open');
      // Store the original viewport height
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    const handleKeyboardClose = () => {
      // Remove class when keyboard closes
      document.body.classList.remove('keyboard-open');
      // Reset viewport height
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // Detect keyboard open/close on iOS
    let initialViewportHeight = window.innerHeight;
    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const difference = initialViewportHeight - currentHeight;
      
      if (difference > 150) {
        handleKeyboardOpen();
      } else {
        handleKeyboardClose();
      }
    };

    window.addEventListener('resize', handleResize);

    // Detect focus on input fields
    const handleInputFocus = () => {
      setTimeout(handleKeyboardOpen, 300); // iOS delay
    };

    const handleInputBlur = () => {
      setTimeout(handleKeyboardClose, 300); // iOS delay
    };

    // Add event listeners to all input elements
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('focus', handleInputFocus);
      input.addEventListener('blur', handleInputBlur);
    });

    // Set initial viewport height
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // Cleanup function
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', preventDoubleTapZoom);
      document.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('popstate', handleBackButton);
      window.removeEventListener('resize', handleResize);
      
      // Remove input event listeners
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        input.removeEventListener('focus', handleInputFocus);
        input.removeEventListener('blur', handleInputBlur);
      });
    };
  }, []);

  return null; // This component doesn't render anything
}