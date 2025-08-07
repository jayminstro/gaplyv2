// Force load gaps from localStorage - run this in browser console
console.log('🔧 Force loading gaps from localStorage...');

// Get today's date
const today = new Date().toLocaleDateString('en-CA');
const todayKey = `gaply_gaps_${today}`;

console.log(`📅 Looking for gaps for today: ${todayKey}`);

// Check if gaps exist in localStorage
const storedGaps = localStorage.getItem(todayKey);
if (storedGaps) {
  try {
    const gaps = JSON.parse(storedGaps);
    console.log(`✅ Found ${gaps.length} gaps in localStorage for today`);
    
    // Display the gaps
    gaps.forEach((gap, index) => {
      console.log(`   ${index + 1}. ${gap.start_time} - ${gap.end_time} (${gap.duration_minutes}m)`);
    });
    
    // Try to trigger a reload of the gaps in the app
    console.log('🔄 Attempting to trigger gap reload...');
    
    // Dispatch a custom event to notify the app
    window.dispatchEvent(new CustomEvent('forceReloadGaps', { 
      detail: { gaps, date: today } 
    }));
    
    console.log('✅ Dispatched forceReloadGaps event');
    
    // Also try to update the global gaps state if possible
    if (window.gaplyApp && window.gaplyApp.setGaps) {
      window.gaplyApp.setGaps(gaps);
      console.log('✅ Updated global gaps state');
    }
    
  } catch (error) {
    console.error('❌ Error parsing gaps:', error);
  }
} else {
  console.log('❌ No gaps found in localStorage for today');
  
  // Check what other gap keys exist
  const keys = Object.keys(localStorage);
  const gapKeys = keys.filter(key => key.startsWith('gaply_gaps_'));
  console.log(`📊 Found ${gapKeys.length} other gap keys:`, gapKeys);
}

console.log('\n💡 If gaps are still not showing, try refreshing the page or check the browser console for errors.'); 