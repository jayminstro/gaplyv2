import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Database, Cloud, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { LoginSyncService } from '../utils/localFirst/LoginSyncService';
import { Task, TimeGap } from '../types/index';

interface LoginSyncTestProps {
  userId: string;
}

export function LoginSyncTest({ userId }: LoginSyncTestProps) {
  const [loginSyncService, setLoginSyncService] = useState<LoginSyncService | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [localData, setLocalData] = useState<{
    tasks: Task[];
    gaps: TimeGap[];
  }>({ tasks: [], gaps: [] });
  const [error, setError] = useState<string | null>(null);

  // Initialize login sync service
  useEffect(() => {
    if (!userId) return;

    const initService = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const service = new LoginSyncService(userId);
        const result = await service.initializeAndSync();
        
        setLoginSyncService(service);
        setSyncResult(result);
        
        // Load local data
        const tasks = await service.getTasks();
        const gaps = await service.getGaps();
        setLocalData({ tasks, gaps });
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    initService();
  }, [userId]);

  const handleRefreshData = async () => {
    if (!loginSyncService) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const tasks = await loginSyncService.getTasks();
      const gaps = await loginSyncService.getGaps();
      setLocalData({ tasks, gaps });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!loginSyncService) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const result = await loginSyncService.initializeAndSync();
      setSyncResult(result);
      
      // Refresh local data
      await handleRefreshData();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Login Sync Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={loginSyncService ? "default" : "secondary"}>
                {loginSyncService ? "Initialized" : "Not Initialized"}
              </Badge>
              <Badge variant={navigator.onLine ? "default" : "destructive"}>
                {navigator.onLine ? "Online" : "Offline"}
              </Badge>
            </div>
            <Button
              onClick={handleManualSync}
              disabled={isLoading || !loginSyncService}
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Manual Sync
            </Button>
          </div>

          {/* Sync Result */}
          {syncResult && (
            <div className="space-y-2">
              <h4 className="font-medium">Last Sync Result:</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Tasks Synced: {syncResult.tasksSynced}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Gaps Synced: {syncResult.gapsSynced}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span>Conflicts: {syncResult.conflictsResolved}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={syncResult.success ? "default" : "destructive"}>
                    {syncResult.success ? "Success" : "Failed"}
                  </Badge>
                </div>
              </div>
              {syncResult.errors.length > 0 && (
                <div className="text-sm text-red-500">
                  <h5 className="font-medium">Errors:</h5>
                  <ul className="list-disc list-inside">
                    {syncResult.errors.map((error: string, index: number) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Local Data */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Local Data:</h4>
              <Button
                onClick={handleRefreshData}
                disabled={isLoading || !loginSyncService}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span>Tasks: {localData.tasks.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span>Gaps: {localData.gaps.length}</span>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
              <h5 className="font-medium">Error:</h5>
              <p>{error}</p>
            </div>
          )}

          {/* Sample Data Display */}
          {localData.tasks.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Sample Tasks:</h4>
              <div className="space-y-1">
                {localData.tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="text-sm p-2 bg-gray-50 rounded">
                    <div className="font-medium">{task.title}</div>
                    <div className="text-gray-500">Due: {task.dueDate}</div>
                  </div>
                ))}
                {localData.tasks.length > 3 && (
                  <div className="text-sm text-gray-500">
                    ... and {localData.tasks.length - 3} more tasks
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 