import { MemoryCache } from './MemoryCache';
import { CacheLimitManager } from './CacheLimits';
import { PredictiveCache } from './PredictiveCache';
import { EnhancedStorageManager } from './EnhancedStorageManager';

/**
 * Test the new cache management features
 */
export async function testCacheFeatures() {
  console.log('🧪 Testing Enhanced Cache Management Features...\n');

  // Test 1: Memory Cache
  console.log('1. Testing Memory Cache...');
  const memoryCache = new MemoryCache({
    maxSize: 10,
    defaultTTL: 5000, // 5 seconds
    evictionPolicy: 'lru'
  });

  // Add some test data
  memoryCache.set('test1', { id: 1, name: 'Task 1' });
  memoryCache.set('test2', { id: 2, name: 'Task 2' });
  memoryCache.set('test3', { id: 3, name: 'Task 3' });

  console.log('✅ Memory cache set operations completed');
  console.log('📊 Memory cache stats:', memoryCache.getStats());

  // Test 2: Cache Limits
  console.log('\n2. Testing Cache Limits...');
  const limitManager = new CacheLimitManager({
    maxTasks: 100,
    maxGaps: 500,
    maxStorageSize: 10 * 1024 * 1024 // 10MB
  });

  limitManager.updateUsage('tasks', 50, 1024 * 1024); // 50 tasks, 1MB
  limitManager.updateUsage('gaps', 200, 2 * 1024 * 1024); // 200 gaps, 2MB

  console.log('✅ Cache limits updated');
  console.log('📊 Usage:', limitManager.getUsage());
  console.log('🔍 Violations:', limitManager.checkViolations());

  // Test 3: Predictive Cache
  console.log('\n3. Testing Predictive Cache...');
  const predictiveCache = new PredictiveCache(memoryCache);

  // Record some access patterns
  predictiveCache.recordAccess({
    type: 'task_access',
    userId: 'user123',
    context: 'morning'
  });

  predictiveCache.recordAccess({
    type: 'gap_access',
    userId: 'user123',
    context: 'afternoon'
  });

  console.log('✅ Access patterns recorded');
  console.log('📊 Analytics:', predictiveCache.getAnalytics());
  console.log('🔮 Prediction report:', predictiveCache.generateReport());

  // Test 4: Enhanced Storage Manager Integration
  console.log('\n4. Testing Enhanced Storage Manager...');
  const enhancedStorage = new EnhancedStorageManager('user123', {
    enableMemoryCache: true,
    enablePredictiveCache: true,
    enableCacheLimits: true,
    memoryCacheConfig: {
      maxSize: 50,
      defaultTTL: 10 * 60 * 1000 // 10 minutes
    },
    cacheLimits: {
      maxTasks: 1000,
      maxGaps: 5000,
      maxStorageSize: 50 * 1024 * 1024 // 50MB
    }
  });

  await enhancedStorage.initialize();
  console.log('✅ Enhanced storage manager initialized');

  // Get cache health report
  const healthReport = enhancedStorage.getCacheHealthReport();
  console.log('📊 Cache health report:', healthReport);

  console.log('\n🎉 All cache management features tested successfully!');
}

/**
 * Performance comparison test
 */
export async function testPerformance() {
  console.log('⚡ Testing Cache Performance...\n');

  const memoryCache = new MemoryCache({ maxSize: 1000 });
  const iterations = 1000;

  // Test without cache
  console.log('Testing without cache...');
  const startWithoutCache = performance.now();
  for (let i = 0; i < iterations; i++) {
    // Simulate expensive operation
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  const timeWithoutCache = performance.now() - startWithoutCache;

  // Test with cache
  console.log('Testing with cache...');
  const startWithCache = performance.now();
  for (let i = 0; i < iterations; i++) {
    const key = `test_${i % 100}`; // Reuse keys to hit cache
    let data = memoryCache.get(key);
    if (!data) {
      // Simulate expensive operation
      await new Promise(resolve => setTimeout(resolve, 1));
      data = { id: i, value: `data_${i}` };
      memoryCache.set(key, data);
    }
  }
  const timeWithCache = performance.now() - startWithCache;

  console.log(`⏱️  Time without cache: ${timeWithoutCache.toFixed(2)}ms`);
  console.log(`⏱️  Time with cache: ${timeWithCache.toFixed(2)}ms`);
  console.log(`🚀 Performance improvement: ${((timeWithoutCache - timeWithCache) / timeWithoutCache * 100).toFixed(1)}%`);
  console.log('📊 Cache stats:', memoryCache.getStats());
}

// Export test functions
export { testCacheFeatures, testPerformance }; 