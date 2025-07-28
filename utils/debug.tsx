import { supabase } from './supabase/client';
import { generateUUID } from './uuid';
import { tasksAPI } from './api';
import { projectId, publicAnonKey } from './supabase/info';

// Debug utility to help identify data saving issues
export const debugDataSaving = {
  // Check environment configuration
  checkEnvironment() {
    console.log('🔍 Checking environment configuration...');
    try {
      console.log('Environment details:', {
        projectId,
        publicAnonKeyExists: !!publicAnonKey,
        publicAnonKeyLength: publicAnonKey?.length,
        nodeEnv: process.env.NODE_ENV,
        currentUrl: window.location.href,
        userAgent: navigator.userAgent
      });
      
      if (!projectId) {
        console.error('❌ Missing projectId');
        return false;
      }
      
      if (!publicAnonKey) {
        console.error('❌ Missing publicAnonKey');
        return false;
      }
      
      console.log('✅ Environment configuration looks good');
      return true;
    } catch (error) {
      console.error('❌ Environment check failed:', error);
      return false;
    }
  },

  // Check authentication status
  async checkAuth() {
    console.log('🔍 Checking authentication status...');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('❌ Auth error:', error);
        return false;
      }
      
      if (!session) {
        console.error('❌ No active session');
        return false;
      }
      
      console.log('✅ Auth check passed:', {
        userId: session.user?.id,
        email: session.user?.email,
        tokenValid: !!session.access_token
      });
      
      return true;
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      return false;
    }
  },

  // Test API connectivity
  async testApiCall() {
    console.log('🌐 Testing API connectivity...');
    try {
      console.log('Testing health endpoint:', `https://${projectId}.supabase.co/functions/v1/make-server-966d4846/health`);
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Health check response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Server health check passed:', data);
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ Server health check failed:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        return false;
      }
    } catch (error) {
      console.error('❌ API connectivity test failed:', {
        error,
        message: error.message,
        projectId,
        url: `https://${projectId}.supabase.co/functions/v1/make-server-966d4846/health`
      });
      return false;
    }
  },

  // Test tasks saving with detailed logging
  async testTasksSaving(testTasks: any[]) {
    console.log('💾 Testing tasks saving with data:', testTasks);
    
    try {
      console.log('1. Checking auth before save...');
      const authOk = await this.checkAuth();
      if (!authOk) return false;

      console.log('2. Attempting to save tasks...');
      const result = await tasksAPI.save(testTasks);
      console.log('✅ Tasks save result:', result);

      console.log('3. Verifying saved data...');
      const savedTasks = await tasksAPI.get();
      console.log('📋 Retrieved tasks:', savedTasks);

      return true;
    } catch (error) {
      console.error('❌ Tasks saving test failed:', error);
      return false;
    }
  },

  // Check database permissions by querying directly
  async testDirectDbQuery() {
    console.log('🗃️ Testing direct database query...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.error('❌ No user session for direct query');
        return false;
      }

      console.log('Querying tasks table directly...');
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id);

      if (error) {
        console.error('❌ Direct DB query error:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        return false;
      }

      console.log('✅ Direct DB query successful:', data);
      return true;
    } catch (error) {
      console.error('❌ Direct DB query failed:', error);
      return false;
    }
  },

  // Check database schema (non-destructive)
  async checkDatabaseSchema() {
    console.log('🏗️ Checking database schema...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.error('❌ No user session for schema check');
        return false;
      }

      // Try to get table schema by querying with a limit of 0
      console.log('Checking tasks table schema...');
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .limit(0);

      if (error) {
        console.error('❌ Schema check error:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        return false;
      }

      console.log('✅ Schema check successful - tasks table exists');
      console.log('ℹ️ Schema testing with actual data insert is available in manual debug tests');
      
      return true;
    } catch (error) {
      console.error('❌ Schema check failed:', error);
      return false;
    }
  },

  // Test manual task insertion
  async testDirectTaskInsertion(testTask: any) {
    console.log('➕ Testing direct task insertion...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.error('❌ No user session for insertion');
        return false;
      }

      // Use correct database column names based on actual schema
      const taskToInsert = {
        id: generateUUID(),
        user_id: session.user.id,
        title: testTask.title || 'Debug Test Task',
        category: testTask.category || 'Personal',
        duration: 10, // Store as integer minutes
        energy_level: 'Medium',
        notes: 'Debug test task for validation',
        priority: 'Medium',
        completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('Inserting task with correct schema:', taskToInsert);
      const { data, error } = await supabase
        .from('tasks')
        .insert(taskToInsert)
        .select()
        .single();

      if (error) {
        console.error('❌ Direct insertion error:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        return false;
      }

      console.log('✅ Direct insertion successful:', data);
      return true;
    } catch (error) {
      console.error('❌ Direct insertion failed:', error);
      return false;
    }
  },

  // Run comprehensive debugging (non-destructive)
  async runFullDiagnosis() {
    console.log('🚀 Running basic database diagnosis...');
    
    const results = {
      environment: this.checkEnvironment(),
      auth: await this.checkAuth(),
      api: await this.testApiCall(),
      schema: await this.checkDatabaseSchema(),
      directQuery: await this.testDirectDbQuery()
    };

    console.log('📊 Diagnosis Results:', results);
    
    if (results.environment && results.auth && results.api && results.schema && results.directQuery) {
      console.log('✅ Basic tests passed - database connection appears healthy');
    } else {
      console.log('❌ Issues found:');
      if (!results.environment) console.log('  - Environment configuration problems');
      if (!results.auth) console.log('  - Authentication problems');
      if (!results.api) console.log('  - API connectivity issues');
      if (!results.schema) console.log('  - Database schema issues');
      if (!results.directQuery) console.log('  - Database permission issues');
    }

    console.log('ℹ️ Use Debug Panel for comprehensive tests including task insertion');
    return results;
  },

  // Run comprehensive debugging with task creation (manual only)
  async runFullDiagnosisWithTaskCreation() {
    console.log('🚀 Running full database saving diagnosis with task creation...');
    
    const results = {
      environment: this.checkEnvironment(),
      auth: await this.checkAuth(),
      api: await this.testApiCall(),
      schema: await this.checkDatabaseSchema(),
      directQuery: await this.testDirectDbQuery(),
      directInsertion: await this.testDirectTaskInsertion({
        title: 'Debug Test Task',
        category: 'Debugging'
      })
    };

    console.log('📊 Full Diagnosis Results:', results);
    
    if (results.environment && results.auth && results.api && results.schema && results.directQuery && results.directInsertion) {
      console.log('✅ All tests passed - database operations working correctly');
    } else {
      console.log('❌ Issues found:');
      if (!results.environment) console.log('  - Environment configuration problems');
      if (!results.auth) console.log('  - Authentication problems');
      if (!results.api) console.log('  - API connectivity issues');
      if (!results.schema) console.log('  - Database schema issues');
      if (!results.directQuery) console.log('  - Database permission issues');
      if (!results.directInsertion) console.log('  - Direct database access issues');
    }

    return results;
  }
};

// Add to window for easy browser console access
if (typeof window !== 'undefined') {
  (window as any).debugDataSaving = debugDataSaving;
}