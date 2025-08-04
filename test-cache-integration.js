// Simple test to verify cache integration
console.log('🧪 Testing Cache Integration...');

// Test memory cache
async function testMemoryCache() {
  console.log('\n1. Testing Memory Cache...');
  
  try {
    const { MemoryCache } = await import('./utils/storage/MemoryCache.ts');
    const cache = new MemoryCache({ maxSize: 5 });
    
    // Test basic operations
    cache.set('test1', { id: 1, name: 'Task 1' });
    cache.set('test2', { id: 2, name: 'Task 2' });
    
    const result1 = cache.get('test1');
    const result2 = cache.get('test2');
    const result3 = cache.get('test3'); // Should be null
    
    console.log('✅ Memory cache test results:');
    console.log('  - test1:', result1 ? '✅ Found' : '❌ Not found');
    console.log('  - test2:', result2 ? '✅ Found' : '❌ Not found');
    console.log('  - test3:', result3 ? '❌ Found (should be null)' : '✅ Not found (correct)');
    
    const stats = cache.getStats();
    console.log('  - Cache stats:', stats);
    
  } catch (error) {
    console.error('❌ Memory cache test failed:', error);
  }
}

// Test cache limits
async function testCacheLimits() {
  console.log('\n2. Testing Cache Limits...');
  
  try {
    const { CacheLimitManager } = await import('./utils/storage/CacheLimits.ts');
    const limitManager = new CacheLimitManager({
      maxTasks: 100,
      maxGaps: 500,
      maxStorageSize: 10 * 1024 * 1024 // 10MB
    });
    
    // Test usage tracking
    limitManager.updateUsage('tasks', 50, 1024 * 1024);
    limitManager.updateUsage('gaps', 200, 2 * 1024 * 1024);
    
    const usage = limitManager.getUsage();
    const violations = limitManager.checkViolations();
    const health = limitManager.getHealthStatus();
    
    console.log('✅ Cache limits test results:');
    console.log('  - Usage:', usage);
    console.log('  - Violations:', violations.length);
    console.log('  - Health status:', health);
    
  } catch (error) {
    console.error('❌ Cache limits test failed:', error);
  }
}

// Test predictive cache
async function testPredictiveCache() {
  console.log('\n3. Testing Predictive Cache...');
  
  try {
    const { MemoryCache } = await import('./utils/storage/MemoryCache.ts');
    const { PredictiveCache } = await import('./utils/storage/PredictiveCache.ts');
    
    const memoryCache = new MemoryCache();
    const predictiveCache = new PredictiveCache(memoryCache);
    
    // Test access pattern recording
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
    
    const analytics = predictiveCache.getAnalytics();
    const report = predictiveCache.generateReport();
    
    console.log('✅ Predictive cache test results:');
    console.log('  - Analytics:', analytics);
    console.log('  - Report:', report);
    
  } catch (error) {
    console.error('❌ Predictive cache test failed:', error);
  }
}

// Run all tests
async function runAllTests() {
  await testMemoryCache();
  await testCacheLimits();
  await testPredictiveCache();
  
  console.log('\n🎉 All cache integration tests completed!');
  console.log('\n📝 Next steps:');
  console.log('1. Check the browser console for cache operation logs');
  console.log('2. Navigate to Settings > Cache Health to see real-time stats');
  console.log('3. Monitor performance improvements in the app');
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  window.testCacheIntegration = runAllTests;
  console.log('💡 Run testCacheIntegration() in the console to test cache features');
} else {
  // Node.js environment
  runAllTests();
} 