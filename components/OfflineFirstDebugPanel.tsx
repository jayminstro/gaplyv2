import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { RefreshCw, Wifi, WifiOff, Database, Cloud, AlertCircle, Download, Upload, Clock } from 'lucide-react';
import { logger, exportLogs } from '../utils/debug';

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  localDataCount: { tasks: number; gaps: number };
  unsyncedCount: { tasks: number; gaps: number };
}

interface OfflineFirstDebugPanelProps {
  syncStatus: SyncStatus;
  onRefreshStatus: () => void;
  onForceSync: () => void;
  onClearLocalData: () => void;
  onExportLogs: () => void;
}

export function OfflineFirstDebugPanel({ 
  syncStatus, 
  onRefreshStatus, 
  onForceSync, 
  onClearLocalData,
  onExportLogs
}: OfflineFirstDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    // Update logs every 5 seconds
    const interval = setInterval(() => {
      setLogs(logger.getLogs());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleExportLogs = () => {
    const logData = exportLogs();
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offline-first-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Offline-First Debug</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'}
          </Button>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Network Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {syncStatus.isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">Network</span>
            </div>
            <Badge variant={syncStatus.isOnline ? "default" : "destructive"}>
              {syncStatus.isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {/* Sync Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <RefreshCw className={`h-4 w-4 ${syncStatus.isSyncing ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
              <span className="text-sm">Sync Status</span>
            </div>
            <Badge variant={syncStatus.isSyncing ? "secondary" : "outline"}>
              {syncStatus.isSyncing ? 'Syncing...' : 'Idle'}
            </Badge>
          </div>

          {/* Local Data */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Local Data</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Tasks: {syncStatus.localDataCount.tasks}</div>
              <div>Gaps: {syncStatus.localDataCount.gaps}</div>
            </div>
          </div>

          {/* Unsynced Data */}
          {syncStatus.unsyncedCount.tasks > 0 || syncStatus.unsyncedCount.gaps > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">Unsynced</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Tasks: {syncStatus.unsyncedCount.tasks}</div>
                <div>Gaps: {syncStatus.unsyncedCount.gaps}</div>
              </div>
            </div>
          ) : null}

          {/* Last Sync Time */}
          {syncStatus.lastSyncTime && (
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>Last sync: {syncStatus.lastSyncTime.toLocaleString()}</span>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshStatus}
              className="flex-1"
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onForceSync}
              disabled={!syncStatus.isOnline || syncStatus.isSyncing}
              className="flex-1"
            >
              Force Sync
            </Button>
          </div>

          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportLogs}
              className="flex-1"
            >
              <Download className="h-3 w-3 mr-1" />
              Export Logs
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onClearLocalData}
              className="flex-1"
            >
              Clear Local
            </Button>
          </div>

          {/* Recent Logs */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Cloud className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">Recent Logs</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {logs.slice(-5).map((log, index) => (
                <div key={index} className="text-xs p-1 bg-gray-100 rounded">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono ${
                      log.level === 'error' ? 'text-red-600' :
                      log.level === 'warn' ? 'text-orange-600' :
                      'text-gray-600'
                    }`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-gray-400">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-700 truncate">{log.message}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
} 