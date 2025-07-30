import { useState } from 'react';
import { Bug, Play, Database, User, CheckCircle, XCircle } from 'lucide-react';
import { debugDataSaving } from '../utils/debug';
import { supabase } from '../utils/supabase/client';
import { tasksAPI } from '../utils/api';
import { Task } from '../types/index';

interface DebugPanelProps {
  isVisible?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export function DebugPanel({ isVisible = true, onClose, embedded = false }: DebugPanelProps) {
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  if (!isVisible) return null;

  const runDebugTests = async () => {
    setIsRunning(true);
    console.log('🚀 Starting comprehensive debug tests...');
    
    try {
      // Run full diagnosis with task creation (manual trigger only)
      const results = await debugDataSaving.runFullDiagnosisWithTaskCreation();
      
      // Test task creation and saving via API
      const testTask: Task = {
        id: `debug-${Date.now()}`,
        title: 'Debug Panel Test Task',
        category: 'Testing',
        duration: '00:15:00',
        status: 'draft',
        iconColor: 'text-blue-400',
        icon: 'TestTube',
        notes: 'This is a debug test task created manually'
      };
      
      console.log('🧪 Testing task API save/retrieve cycle...');
      
      // Test saving a single task via API
      try {
        await tasksAPI.save([testTask]);
        console.log('✅ Task API save successful');
        
        // Verify by retrieving
        const retrievedTasks = await tasksAPI.get();
        console.log('📋 Retrieved tasks:', retrievedTasks);
        
        const foundTask = retrievedTasks.find(t => t.id === testTask.id);
        if (foundTask) {
          console.log('✅ Test task found in retrieved data');
          results.taskSaveTest = true;
        } else {
          console.log('❌ Test task NOT found in retrieved data');
          results.taskSaveTest = false;
        }
      } catch (taskError) {
        console.error('❌ Task API save/retrieve test failed:', taskError);
        results.taskSaveTest = false;
        results.taskError = taskError.message;
      }
      
      setTestResults(results);
    } catch (error) {
      console.error('❌ Debug tests failed:', error);
      setTestResults({ error: error.message });
    } finally {
      setIsRunning(false);
    }
  };

  const clearTestData = async () => {
    try {
      console.log('🧹 Clearing all debug test data...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.error('❌ No user session for clearing data');
        return;
      }

      // Delete debug tasks with different naming patterns
      const deleteOperations = [
        // Debug panel tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).like('id', 'debug-%'),
        // Schema test tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('title', 'Schema Test'),
        // Debug test tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('title', 'Debug Test Task'),
        // Category-based debug tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('category', 'Debugging'),
        supabase.from('tasks').delete().eq('user_id', session.user.id).eq('category', 'Testing'),
        // Note-based debug tasks
        supabase.from('tasks').delete().eq('user_id', session.user.id).like('notes', '%Debug test task%')
      ];

      const results = await Promise.allSettled(deleteOperations);
      
      let deletedCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          console.log(`✅ Cleared debug tasks (operation ${index + 1})`);
          deletedCount++;
        } else if (result.status === 'rejected' || result.value.error) {
          console.error(`❌ Failed to clear some debug tasks (operation ${index + 1}):`);
        }
      });

      console.log(`✅ Test data cleanup completed (${deletedCount}/${deleteOperations.length} operations successful)`);
    } catch (error) {
      console.error('❌ Failed to clear test data:', error);
    }
  };

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm text-white font-medium">Debug Tools</h3>
        </div>

        <div className="space-y-4">
          <button
            onClick={runDebugTests}
            disabled={isRunning}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Running Tests...' : 'Run Debug Tests'}
          </button>

          <button
            onClick={clearTestData}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            Clear Test Data
          </button>

          {testResults && (
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-white font-medium mb-3">Test Results:</h3>
              
              {testResults.error ? (
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>Error: {testResults.error}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 ${testResults.environment ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.environment ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Environment Config</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.auth ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.auth ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Authentication</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.api ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.api ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>API Connectivity</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.schema ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.schema ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Schema</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directQuery ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directQuery ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Query</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directInsertion ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directInsertion ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Direct DB Insert</span>
                  </div>
                  
                  {testResults.taskSaveTest !== undefined && (
                    <div className={`flex items-center gap-2 ${testResults.taskSaveTest ? 'text-green-400' : 'text-red-400'}`}>
                      {testResults.taskSaveTest ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span>Task Save/Retrieve</span>
                    </div>
                  )}
                  
                  {testResults.taskError && (
                    <div className="text-red-400 text-sm mt-2">
                      Task Error: {testResults.taskError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-slate-400 text-sm">
            <p>This panel runs comprehensive tests to identify data saving issues:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Authentication status</li>
              <li>API server connectivity</li>
              <li>Database permissions</li>
              <li>Direct database operations</li>
              <li>Task save/retrieve cycle</li>
            </ul>
            <p className="mt-2">Check the browser console for detailed logs.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl text-white">Debug Panel</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <button
            onClick={runDebugTests}
            disabled={isRunning}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Running Tests...' : 'Run Debug Tests'}
          </button>

          <button
            onClick={clearTestData}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            Clear Test Data
          </button>

          {testResults && (
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-white font-medium mb-3">Test Results:</h3>
              
              {testResults.error ? (
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>Error: {testResults.error}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 ${testResults.environment ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.environment ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Environment Config</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.auth ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.auth ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Authentication</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.api ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.api ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>API Connectivity</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.schema ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.schema ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Schema</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directQuery ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directQuery ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Database Query</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${testResults.directInsertion ? 'text-green-400' : 'text-red-400'}`}>
                    {testResults.directInsertion ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>Direct DB Insert</span>
                  </div>
                  
                  {testResults.taskSaveTest !== undefined && (
                    <div className={`flex items-center gap-2 ${testResults.taskSaveTest ? 'text-green-400' : 'text-red-400'}`}>
                      {testResults.taskSaveTest ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span>Task Save/Retrieve</span>
                    </div>
                  )}
                  
                  {testResults.taskError && (
                    <div className="text-red-400 text-sm mt-2">
                      Task Error: {testResults.taskError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-slate-400 text-sm">
            <p>This panel runs comprehensive tests to identify data saving issues:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Authentication status</li>
              <li>API server connectivity</li>
              <li>Database permissions</li>
              <li>Direct database operations</li>
              <li>Task save/retrieve cycle</li>
            </ul>
            <p className="mt-2">Check the browser console for detailed logs.</p>
          </div>
        </div>
      </div>
    </div>
  );
}