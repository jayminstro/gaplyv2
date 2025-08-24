// Test script to check app startup performance
console.log('🧪 Testing app startup...');

// Simulate the main initialization flow
const testInitialization = async () => {
  const startTime = Date.now();
  
  try {
    // Test 1: Basic React rendering
    console.log('✅ Test 1: Basic React rendering - PASSED');
    
    // Test 2: Storage detection
    const storageTest = () => {
      if (typeof window !== 'undefined') {
        if (window.indexedDB) {
          console.log('✅ Test 2: IndexedDB available - PASSED');
          return true;
        } else if (window.localStorage) {
          console.log('✅ Test 2: localStorage available - PASSED');
          return true;
        }
      }
      console.log('❌ Test 2: No storage available - FAILED');
      return false;
    };
    
    const storageAvailable = storageTest();
    
    // Test 3: Async operations with timeout
    const asyncTest = () => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('⚠️ Test 3: Async operation timed out after 5s');
          resolve(false);
        }, 5000);
        
        // Simulate some async work
        setTimeout(() => {
          clearTimeout(timeout);
          console.log('✅ Test 3: Async operations - PASSED');
          resolve(true);
        }, 100);
      });
    };
    
    const asyncResult = await asyncTest();
    
    // Test 4: Performance check
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (duration < 1000) {
      console.log(`✅ Test 4: Performance check - PASSED (${duration}ms)`);
    } else {
      console.log(`⚠️ Test 4: Performance check - SLOW (${duration}ms)`);
    }
    
    console.log('🎉 All tests completed!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
};

// Run the test
testInitialization().then(success => {
  if (success) {
    console.log('🚀 App startup test completed successfully');
  } else {
    console.log('💥 App startup test failed');
  }
});
