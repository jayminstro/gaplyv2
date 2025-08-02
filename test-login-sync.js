// Simple test script to verify login sync functionality
// Run this in the browser console after the app loads

console.log('🧪 Testing Login Sync Implementation...');

// Test 1: Check if LoginSyncService is available
if (typeof window.LoginSyncService === 'undefined') {
  console.log('❌ LoginSyncService not found in global scope');
} else {
  console.log('✅ LoginSyncService is available');
}

// Test 2: Check if database models have getAll method
async function testDatabaseModels() {
  try {
    // This would need to be run in the context of the app
    console.log('🔍 Testing database models...');
    
    // Check if we can access the database
    const db = await Dexie.open('GaplyLocalDB_test');
    console.log('✅ Database connection successful');
    
    // Check if tables exist
    const tables = db.tables.map(t => t.name);
    console.log('📋 Available tables:', tables);
    
    // Check if getAll method exists (this would be on the models)
    console.log('ℹ️ Note: getAll method should be available on TaskModel and GapModel');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  }
}

// Test 3: Check if API endpoints are accessible
async function testAPIEndpoints() {
  try {
    console.log('🌐 Testing API endpoints...');
    
    // Check if supabase client is available
    if (typeof window.supabase !== 'undefined') {
      console.log('✅ Supabase client is available');
      
      // Check session
      const { data: { session } } = await window.supabase.auth.getSession();
      if (session) {
        console.log('✅ User session found');
      } else {
        console.log('⚠️ No user session found');
      }
    } else {
      console.log('❌ Supabase client not found');
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

// Test 4: Check if components are rendered
function testComponents() {
  console.log('🎨 Testing UI components...');
  
  // Check if LoginSyncTest component is rendered
  const testComponent = document.querySelector('[data-testid="login-sync-test"]');
  if (testComponent) {
    console.log('✅ LoginSyncTest component is rendered');
  } else {
    console.log('⚠️ LoginSyncTest component not found (check Settings tab)');
  }
  
  // Check if OfflineFirstDebugPanel is rendered
  const debugPanel = document.querySelector('[data-testid="offline-first-debug-panel"]');
  if (debugPanel) {
    console.log('✅ OfflineFirstDebugPanel component is rendered');
  } else {
    console.log('⚠️ OfflineFirstDebugPanel component not found');
  }
}

// Run tests
console.log('\n🚀 Running tests...\n');

// These tests need to be run in the context of the app
console.log('📝 Manual verification steps:');
console.log('1. Login to the app');
console.log('2. Navigate to Settings tab');
console.log('3. Look for "Login Sync Test" component');
console.log('4. Check if sync status shows data');
console.log('5. Try the "Manual Sync" button');
console.log('6. Check browser console for sync logs');

console.log('\n🔧 To run database tests, execute in app context:');
console.log('testDatabaseModels()');
console.log('testAPIEndpoints()');
console.log('testComponents()');

// Export test functions for manual testing
window.testLoginSync = {
  testDatabaseModels,
  testAPIEndpoints,
  testComponents
};

console.log('\n✅ Test script loaded. Use window.testLoginSync to run tests manually.'); 