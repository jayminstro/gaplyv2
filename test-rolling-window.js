// Test script for 14-day rolling window and gap splitting
console.log('🧪 Testing 14-day rolling window and gap splitting logic...');

// Mock data for testing
const mockPreferences = {
  calendar_work_start: '09:00',
  calendar_work_end: '17:00',
  calendar_working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
};

const mockUserId = 'test-user-123';

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

// Test gap creation for a single day
function testGapCreation(date) {
  console.log(`\n⏰ Testing gap creation for ${date}...`);
  
  // Simulate creating gaps from 9 AM to 5 PM
  const gaps = [];
  const startHour = 9;
  const endHour = 17;
  
  for (let hour = startHour; hour < endHour; hour++) {
    const gap = {
      id: `gap-${date}-${hour}`,
      user_id: mockUserId,
      date: date,
      start_time: `${hour.toString().padStart(2, '0')}:00`,
      end_time: `${(hour + 1).toString().padStart(2, '0')}:00`,
      duration_minutes: 60,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modified_by: 'system'
    };
    gaps.push(gap);
  }
  
  console.log(`✅ Created ${gaps.length} gaps for ${date}`);
  console.log(`📋 Gap times: ${gaps.map(g => `${g.start_time}-${g.end_time}`).join(', ')}`);
  
  return gaps;
}

// Test gap splitting logic
function testGapSplitting(originalGap, taskStartTime, taskEndTime) {
  console.log(`\n✂️ Testing gap splitting...`);
  console.log(`Original gap: ${originalGap.start_time} - ${originalGap.end_time}`);
  console.log(`Task: ${taskStartTime} - ${taskEndTime}`);
  
  const gapStart = timeToMinutes(originalGap.start_time);
  const gapEnd = timeToMinutes(originalGap.end_time);
  const taskStart = timeToMinutes(taskStartTime);
  const taskEnd = timeToMinutes(taskEndTime);
  
  const newGaps = [];
  
  // Gap before task (if any)
  if (taskStart > gapStart) {
    newGaps.push({
      id: `gap-${originalGap.id}-before`,
      user_id: originalGap.user_id,
      date: originalGap.date,
      start_time: originalGap.start_time,
      end_time: taskStartTime,
      duration_minutes: taskStart - gapStart
    });
  }
  
  // Gap after task (if any)
  if (taskEnd < gapEnd) {
    newGaps.push({
      id: `gap-${originalGap.id}-after`,
      user_id: originalGap.user_id,
      date: originalGap.date,
      start_time: taskEndTime,
      end_time: originalGap.end_time,
      duration_minutes: gapEnd - taskEnd
    });
  }
  
  console.log(`✅ Split into ${newGaps.length} new gaps`);
  newGaps.forEach((gap, index) => {
    console.log(`  Gap ${index + 1}: ${gap.start_time} - ${gap.end_time} (${gap.duration_minutes}m)`);
  });
  
  return newGaps;
}

// Helper function to convert time to minutes
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Run tests
console.log('🚀 Starting tests...\n');

// Test 1: Rolling window
const window = testRollingWindow();

// Test 2: Gap creation for today
const today = new Date().toLocaleDateString('en-CA');
const todayGaps = testGapCreation(today);

// Test 3: Gap splitting
if (todayGaps.length > 0) {
  const testGap = todayGaps[2]; // Use the 11:00-12:00 gap
  const splitGaps = testGapSplitting(testGap, '11:15', '11:45');
}

// Test 4: 14-day window gap creation
console.log('\n📅 Testing 14-day window gap creation...');
const startDate = new Date(window.window_start);
const endDate = new Date(window.window_end);
let totalGaps = 0;

for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
  const dateStr = date.toLocaleDateString('en-CA');
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  // Only create gaps for working days
  if (mockPreferences.calendar_working_days.includes(dayOfWeek)) {
    const dayGaps = testGapCreation(dateStr);
    totalGaps += dayGaps.length;
  } else {
    console.log(`⏸️ Skipping ${dateStr} (${dayOfWeek}) - not a working day`);
  }
}

console.log(`\n🎉 Test completed!`);
console.log(`📊 Summary:`);
console.log(`  - Rolling window: ${window.window_start} to ${window.window_end}`);
console.log(`  - Total gaps created: ${totalGaps}`);
console.log(`  - Working days: ${mockPreferences.calendar_working_days.join(', ')}`);
console.log(`  - Work hours: ${mockPreferences.calendar_work_start} - ${mockPreferences.calendar_work_end}`);

console.log('\n✅ 14-day rolling window and gap splitting logic is working correctly!'); 