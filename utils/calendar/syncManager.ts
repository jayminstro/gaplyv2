export type SyncResult = { success: boolean; updated: number; cursor?: string };

export class CalendarSyncManager {
  async incrementalSync(_source: 'device'|'google', cursor?: string): Promise<SyncResult> {
    // Placeholder: real device provider lacks cursors; return no-op
    return { success: true, updated: 0, cursor };
  }

  async fullSync(_source: 'device'|'google', _dateRange: { start: string; end: string }): Promise<SyncResult> {
    // Placeholder for future implementation
    return { success: true, updated: 0 };
  }

  shouldFullSync(_lastSync?: string, _preferences?: any): boolean {
    return false;
  }

  private async handleSyncFailure(_error: unknown): Promise<void> {
    // no-op placeholder
  }
}


