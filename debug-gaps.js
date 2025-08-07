// Debug script to check localStorage gaps
console.log('🔍 Debugging gaps in localStorage...');

// Get all localStorage keys
const keys = Object.keys(localStorage);
const gapKeys = keys.filter(key => key.startsWith('gaply_gaps_'));

console.log(`📊 Found ${gapKeys.length} gap keys in localStorage:`);

gapKeys.forEach(key => {
  try {
    const gaps = JSON.parse(localStorage.getItem(key));
    console.log(`\n📅 ${key}:`);
    console.log(`   - ${gaps.length} gaps`);
    if (gaps.length > 0) {
      console.log(`   - First gap: ${gaps[0].start_time} - ${gaps[0].end_time} (${gaps[0].duration_minutes}m)`);
      console.log(`   - Last gap: ${gaps[gaps.length-1].start_time} - ${gaps[gaps.length-1].end_time} (${gaps[gaps.length-1].duration_minutes}m)`);
    }
  } catch (error) {
    console.log(`   - Error parsing: ${error.message}`);
  }
});

// Check for today's gaps specifically
const today = new Date().toLocaleDateString('en-CA');
const todayKey = `gaply_gaps_${today}`;
console.log(`\n🎯 Checking for today's gaps (${todayKey}):`);

if (localStorage.getItem(todayKey)) {
  try {
    const todayGaps = JSON.parse(localStorage.getItem(todayKey));
    console.log(`✅ Found ${todayGaps.length} gaps for today`);
    todayGaps.forEach((gap, index) => {
      console.log(`   ${index + 1}. ${gap.start_time} - ${gap.end_time} (${gap.duration_minutes}m)`);
    });
  } catch (error) {
    console.log(`❌ Error parsing today's gaps: ${error.message}`);
  }
} else {
  console.log(`❌ No gaps found for today`);
}

// Check sessionStorage for app state
console.log(`\n📱 Checking sessionStorage for app state:`);
const appState = sessionStorage.getItem('gaplyAppState');
if (appState) {
  try {
    const state = JSON.parse(appState);
    console.log(`✅ App state found:`);
    console.log(`   - Authenticated: ${state.isAuthenticated}`);
    console.log(`   - User ID: ${state.userId}`);
    console.log(`   - Active Tab: ${state.activeTab}`);
    console.log(`   - Timestamp: ${new Date(state.timestamp).toLocaleString()}`);
  } catch (error) {
    console.log(`❌ Error parsing app state: ${error.message}`);
  }
} else {
  console.log(`❌ No app state found in sessionStorage`);
}

console.log('\n🔧 To manually load gaps for today, run:');
console.log(`localStorage.getItem('gaply_gaps_${today}')`); 