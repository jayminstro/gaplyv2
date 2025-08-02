/**
 * Storage Encryption Utility
 * Provides client-side encryption for sensitive data before storage
 */

export class StorageEncryption {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;
  private static readonly SALT_LENGTH = 16;
  private static readonly ITERATIONS = 100000;

  /**
   * Generate a cryptographic key from a password
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with a password
   */
  static async encrypt(data: string, password: string): Promise<string> {
    try {
      // Generate salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Encrypt the data
      const encodedData = new TextEncoder().encode(data);
      const encryptedData = await crypto.subtle.encrypt(
        { name: this.ALGORITHM, iv: iv },
        key,
        encodedData
      );

      // Combine salt, IV, and encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with a password
   */
  static async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      // Extract salt, IV, and encrypted data
      const salt = combined.slice(0, this.SALT_LENGTH);
      const iv = combined.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const encrypted = combined.slice(this.SALT_LENGTH + this.IV_LENGTH);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Decrypt the data
      const decryptedData = await crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv: iv },
        key,
        encrypted
      );

      // Convert back to string
      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - incorrect password or corrupted data');
    }
  }

  /**
   * Check if data is encrypted
   */
  static isEncrypted(data: string): boolean {
    try {
      // Try to decode as base64 and check structure
      const combined = new Uint8Array(
        atob(data).split('').map(char => char.charCodeAt(0))
      );
      
      // Check if it has the expected length for salt + IV + some encrypted data
      return combined.length >= this.SALT_LENGTH + this.IV_LENGTH + 1;
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure random password
   */
  static generatePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  /**
   * Hash a password for storage (one-way)
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);
    
    // Combine salt and hash
    const combined = new Uint8Array(salt.length + hashArray.length);
    combined.set(salt, 0);
    combined.set(hashArray, salt.length);
    
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const combined = new Uint8Array(
        atob(hash).split('').map(char => char.charCodeAt(0))
      );
      
      const salt = combined.slice(0, this.SALT_LENGTH);
      const storedHash = combined.slice(this.SALT_LENGTH);
      
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const computedHash = await crypto.subtle.digest('SHA-256', data);
      const computedHashArray = new Uint8Array(computedHash);
      
      // Compare hashes
      if (storedHash.length !== computedHashArray.length) {
        return false;
      }
      
      for (let i = 0; i < storedHash.length; i++) {
        if (storedHash[i] !== computedHashArray[i]) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Encrypted Storage Strategy
 * Wraps any storage strategy with encryption
 */
export class EncryptedStorageStrategy {
  private storage: any;
  private encryptionKey: string;
  private encryptFields: Set<string>;

  constructor(storage: any, encryptionKey: string, encryptFields: string[] = []) {
    this.storage = storage;
    this.encryptionKey = encryptionKey;
    this.encryptFields = new Set(encryptFields);
  }

  /**
   * Encrypt sensitive fields in an object
   */
  private async encryptObject(obj: any): Promise<any> {
    if (!obj || typeof obj !== 'object') return obj;

    const encrypted = { ...obj };
    
    for (const [key, value] of Object.entries(encrypted)) {
      if (this.encryptFields.has(key) && typeof value === 'string') {
        encrypted[key] = await StorageEncryption.encrypt(value, this.encryptionKey);
      } else if (typeof value === 'object' && value !== null) {
        encrypted[key] = await this.encryptObject(value);
      }
    }

    return encrypted;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  private async decryptObject(obj: any): Promise<any> {
    if (!obj || typeof obj !== 'object') return obj;

    const decrypted = { ...obj };
    
    for (const [key, value] of Object.entries(decrypted)) {
      if (this.encryptFields.has(key) && typeof value === 'string' && StorageEncryption.isEncrypted(value)) {
        try {
          decrypted[key] = await StorageEncryption.decrypt(value, this.encryptionKey);
        } catch (error) {
          console.warn(`Failed to decrypt field ${key}:`, error);
          // Keep encrypted value if decryption fails
        }
      } else if (typeof value === 'object' && value !== null) {
        decrypted[key] = await this.decryptObject(value);
      }
    }

    return decrypted;
  }

  // Delegate all storage methods with encryption/decryption
  async initialize(): Promise<void> {
    return this.storage.initialize();
  }

  async saveTasks(tasks: any[], replaceAll?: boolean): Promise<void> {
    const encryptedTasks = await Promise.all(
      tasks.map(task => this.encryptObject(task))
    );
    return this.storage.saveTasks(encryptedTasks, replaceAll);
  }

  async saveTask(task: any): Promise<void> {
    const encryptedTask = await this.encryptObject(task);
    return this.storage.saveTask(encryptedTask);
  }

  async getTasks(): Promise<any[]> {
    const tasks = await this.storage.getTasks();
    return Promise.all(
      tasks.map(task => this.decryptObject(task))
    );
  }

  async updateTask(taskId: string, updates: any): Promise<any> {
    const encryptedUpdates = await this.encryptObject(updates);
    const result = await this.storage.updateTask(taskId, encryptedUpdates);
    return result ? this.decryptObject(result) : null;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.storage.deleteTask(taskId);
  }

  async saveGaps(gaps: any[], date: string): Promise<void> {
    const encryptedGaps = await Promise.all(
      gaps.map(gap => this.encryptObject(gap))
    );
    return this.storage.saveGaps(encryptedGaps, date);
  }

  async getGaps(date: string): Promise<any[]> {
    const gaps = await this.storage.getGaps(date);
    return Promise.all(
      gaps.map(gap => this.decryptObject(gap))
    );
  }

  async getAllGaps(): Promise<any[]> {
    const gaps = await this.storage.getAllGaps();
    return Promise.all(
      gaps.map(gap => this.decryptObject(gap))
    );
  }

  async savePreferences(preferences: any): Promise<void> {
    const encryptedPrefs = await this.encryptObject(preferences);
    return this.storage.savePreferences(encryptedPrefs);
  }

  async getPreferences(): Promise<any> {
    const prefs = await this.storage.getPreferences();
    return prefs ? this.decryptObject(prefs) : null;
  }

  async saveCalendarState(key: string, value: any): Promise<void> {
    const encryptedValue = await this.encryptObject(value);
    return this.storage.saveCalendarState(key, encryptedValue);
  }

  async getCalendarState(key: string): Promise<any> {
    const value = await this.storage.getCalendarState(key);
    return value ? this.decryptObject(value) : null;
  }

  async removeCalendarState(key: string): Promise<void> {
    return this.storage.removeCalendarState(key);
  }

  async getStorageInfo(): Promise<any> {
    return this.storage.getStorageInfo();
  }

  async cleanupOldData(daysToKeep?: number): Promise<number> {
    return this.storage.cleanupOldData(daysToKeep);
  }

  async close(): Promise<void> {
    return this.storage.close();
  }
} 