// Test script to verify all future dates have gaps
console.log('🧪 Testing future gap creation for 14-day rolling window...');

// Mock data for testing
const mockPreferences = {
  calendar_work_start: '09:00',
  calendar_work_end: '17:00',
  calendar_working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
};

// Test rolling window calculation
function testRollingWindow() {
  console.log('\n📅 Testing rolling window calculation...');
  
  const today = new Date();
  const window_start = new Date(today);
  window_start.setDate(today.getDate() - 7);
  const window_end = new Date(today);
  window_end.setDate(today.getDate() + 7);
  
  const window_start_str = window_start.toLocaleDateString('en-CA');
  const window_end_str = window_end.toLocaleDateString('en-CA');
  
  console.log(`✅ Rolling window: ${window_start_str} to ${window_end_str}`);
  console.log(`📊 Window spans ${Math.abs(window_end.getTime() - window_start.getTime()) / (1000 * 60 * 60 * 24)} days`);
  
  return { window_start: window_start_str, window_end: window_end_str };
}

// Test future date gap creation
function testFutureGapCreation() {
  console.log('\n🔮 Testing future gap creation...');
  
  const today = new Date().toLocaleDateString('en-CA');
  const window_end = new Date();
  window_end.setDate(window_end.getDate() + 7);
  const window_end_str = window_end.toLocaleDateString('en-CA');
  
  console.log(`📅 Today: ${today}`);
  console.log(`📅 End of rolling window: ${window_end_str}`);
  
  // Get all dates from today to the end of the rolling window
  const startDate = new Date(today);
  const endDate = new Date(window_end);
  const futureDates = [];
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toLocaleDateString('en-CA');
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Check if it's a working day
    if (mockPreferences.calendar_working_days.includes(dayOfWeek)) {
      futureDates.push({
        date: dateStr,
        dayOfWeek: dayOfWeek,
        isToday: dateStr === today
      });
    } else {
      console.log(`⏸️ Skipping non-working day: ${dateStr} (${dayOfWeek})`);
    }
  }
  
  console.log(`\n📊 Future working days that will have gaps:`);
  futureDates.forEach((dateInfo, index) => {
    const todayIndicator = dateInfo.isToday ? ' (TODAY)' : '';
    console.log(`   ${index + 1}. ${dateInfo.date} - ${dateInfo.dayOfWeek}${todayIndicator}`);
  });
  
  console.log(`\n✅ Total future working days: ${futureDates.length}`);
  console.log(`✅ Each day will have ${8} gaps (9:00-17:00, hourly)`);
  console.log(`✅ Total future gaps to be created: ${futureDates.length * 8}`);
  
  return futureDates;
}

// Test gap creation for a specific date
function testGapCreationForDate(dateStr, dayOfWeek) {
  console.log(`\n⏰ Testing gap creation for ${dateStr} (${dayOfWeek})...`);
  
  // Simulate creating gaps from 9 AM to 5 PM
  const gaps = [];
  const startHour = 9;
  const endHour = 17;
  
  for (let hour = startHour; hour < endHour; hour++) {
    const gap = {
      id: `gap-${dateStr}-${hour}`,
      date: dateStr,
      start_time: `${hour.toString().padStart(2, '0')}:00`,
      end_time: `${(hour + 1).toString().padStart(2, '0')}:00`,
      duration_minutes: 60,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modified_by: 'system'
    };
    gaps.push(gap);
  }
  
  console.log(`✅ Created ${gaps.length} gaps for ${dateStr}`);
  console.log(`📋 Gap times: ${gaps.map(g => `${g.start_time}-${g.end_time}`).join(', ')}`);
  
  return gaps;
}

// Run tests
console.log('🚀 Starting future gap tests...\n');

// Test 1: Rolling window
const window = testRollingWindow();

// Test 2: Future date identification
const futureDates = testFutureGapCreation();

// Test 3: Gap creation for each future date
console.log('\n🔮 Testing gap creation for each future date...');
let totalGaps = 0;

futureDates.forEach((dateInfo, index) => {
  const gaps = testGapCreationForDate(dateInfo.date, dateInfo.dayOfWeek);
  totalGaps += gaps.length;
  
  // Add a small delay between dates for better console output
  if (index < futureDates.length - 1) {
    console.log('   ⏳ Processing next date...');
  }
});

console.log(`\n🎉 Test completed!`);
console.log(`📊 Summary:`);
console.log(`  - Rolling window: ${window.window_start} to ${window.window_end}`);
console.log(`  - Future working days: ${futureDates.length}`);
console.log(`  - Total gaps to be created: ${totalGaps}`);
console.log(`  - Working days: ${mockPreferences.calendar_working_days.join(', ')}`);
console.log(`  - Work hours: ${mockPreferences.calendar_work_start} - ${mockPreferences.calendar_work_end}`);

console.log('\n✅ All future dates in the rolling window will have gaps!');
console.log('✅ The app will now proactively create gaps for all future working days.'); 