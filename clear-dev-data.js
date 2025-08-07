// Clear development data script
console.log('🧹 Clearing local development data...');

// Clear localStorage
if (typeof window !== 'undefined') {
  const keys = Object.keys(localStorage);
  const gaplyKeys = keys.filter(key => key.startsWith('gaply_'));
  
  gaplyKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️ Removed: ${key}`);
  });
  
  console.log(`✅ Cleared ${gaplyKeys.length} local storage items`);
}

// Clear sessionStorage
if (typeof window !== 'undefined') {
  const keys = Object.keys(sessionStorage);
  const gaplyKeys = keys.filter(key => key.startsWith('gaply_'));
  
  gaplyKeys.forEach(key => {
    sessionStorage.removeItem(key);
    console.log(`🗑️ Removed: ${key}`);
  });
  
  console.log(`✅ Cleared ${gaplyKeys.length} session storage items`);
}

console.log('🎉 Development data cleared! Refresh your browser to see the changes.'); 