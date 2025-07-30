// Debounce utility to prevent excessive API calls and expensive operations
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Throttle utility for limiting function calls to once per interval
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Utility to batch multiple async operations and execute them together
export class AsyncBatcher<T> {
  private batch: Array<{ args: any; resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly batchDelay: number;
  private readonly batchSize: number;
  private readonly executor: (items: any[]) => Promise<T[]>;

  constructor(
    executor: (items: any[]) => Promise<T[]>,
    batchDelay: number = 100,
    batchSize: number = 10
  ) {
    this.executor = executor;
    this.batchDelay = batchDelay;
    this.batchSize = batchSize;
  }

  add(item: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batch.push({ args: item, resolve, reject });

      // Execute immediately if batch is full
      if (this.batch.length >= this.batchSize) {
        this.executeBatch();
        return;
      }

      // Schedule batch execution if not already scheduled
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.executeBatch();
        }, this.batchDelay);
      }
    });
  }

  private async executeBatch() {
    if (this.batch.length === 0) return;

    const currentBatch = this.batch.splice(0);
    this.batchTimeout = null;

    try {
      const args = currentBatch.map(item => item.args);
      const results = await this.executor(args);

      // Resolve all promises with their corresponding results
      currentBatch.forEach((item, index) => {
        if (results[index] !== undefined) {
          item.resolve(results[index]);
        } else {
          item.reject(new Error('No result for batch item'));
        }
      });
    } catch (error) {
      // Reject all promises with the error
      currentBatch.forEach(item => {
        item.reject(error as Error);
      });
    }
  }

  // Clear any pending batches
  clear() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    // Reject all pending items
    const pendingBatch = this.batch.splice(0);
    pendingBatch.forEach(item => {
      item.reject(new Error('Batch cleared'));
    });
  }
}

// React hook for debounced values
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Import React for the hook
import React from 'react';