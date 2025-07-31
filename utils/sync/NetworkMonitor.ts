export class NetworkMonitor {
  private _isOnline: boolean = navigator.onLine;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      this._isOnline = true;
      console.log('🌐 Network connection restored');
    });

    window.addEventListener('offline', () => {
      this._isOnline = false;
      console.log('❌ Network connection lost');
    });
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      // Try to fetch a small resource to test connectivity
      const response = await fetch('/favicon.ico', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      this._isOnline = response.ok;
      return this._isOnline;
    } catch (error) {
      this._isOnline = false;
      return false;
    }
  }

  getConnectionType(): string {
    if ('connection' in navigator) {
      return (navigator as any).connection?.effectiveType || 'unknown';
    }
    return 'unknown';
  }

  isSlowConnection(): boolean {
    const connectionType = this.getConnectionType();
    return connectionType === 'slow-2g' || connectionType === '2g';
  }
} 