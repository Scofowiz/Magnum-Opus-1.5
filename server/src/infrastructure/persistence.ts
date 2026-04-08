/**
 * File-Based Persistence Module
 *
 * Provides atomic file operations with backup and recovery.
 * Implements repository pattern for data access.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '../core/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

let dataDir: string | null = null;
const logger = createLogger('persistence');

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the persistence layer with a data directory
 */
export function initializePersistence(directory: string): void {
  dataDir = directory;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  logger.info('Persistence initialized', { directory });
}

/**
 * Get the data directory path
 */
export function getDataDirectory(): string {
  if (!dataDir) {
    throw new Error('Persistence not initialized. Call initializePersistence first.');
  }
  return dataDir;
}

// ============================================================================
// CORE FILE OPERATIONS
// ============================================================================

/**
 * Load data from a JSON file with type safety
 */
export function loadData<T>(filename: string, defaultValue: T): T {
  if (!dataDir) {
    logger.warn('Persistence not initialized, returning default', { filename });
    return defaultValue;
  }

  const filepath = path.join(dataDir, filename);

  try {
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (error) {
    logger.error(`Error loading ${filename}`, { error: String(error) });

    // Try to recover from backup
    const backupPath = filepath + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        const data = JSON.parse(backupContent) as T;
        logger.info(`Recovered ${filename} from backup`);
        return data;
      } catch (backupError) {
        logger.error(`Failed to recover ${filename} from backup`, {
          error: String(backupError),
        });
      }
    }
  }

  return defaultValue;
}

/**
 * Save data to a JSON file with atomic write and backup
 */
export function saveData<T>(filename: string, data: T): void {
  if (!dataDir) {
    throw new Error('Persistence not initialized. Call initializePersistence first.');
  }

  const filepath = path.join(dataDir, filename);
  const backupPath = filepath + '.backup';
  const tempPath = filepath + '.tmp';

  try {
    // Serialize first - if this fails, we haven't touched any files
    const serialized = JSON.stringify(data, null, 2);

    // Backup existing file if it exists
    if (fs.existsSync(filepath)) {
      fs.copyFileSync(filepath, backupPath);
    }

    // Write to temp file first (atomic preparation)
    fs.writeFileSync(tempPath, serialized);

    // Rename temp to final (atomic on most filesystems)
    fs.renameSync(tempPath, filepath);

    logger.debug(`Saved ${filename}`, { size: serialized.length });
  } catch (error) {
    logger.error(`CRITICAL: Failed to save ${filename}`, { error: String(error) });

    // If we have a backup and the main file is corrupted, restore it
    if (fs.existsSync(backupPath) && !fs.existsSync(filepath)) {
      try {
        fs.copyFileSync(backupPath, filepath);
        logger.info(`Restored ${filename} from backup`);
      } catch (restoreError) {
        logger.error(`CRITICAL: Failed to restore ${filename} from backup`, {
          error: String(restoreError),
        });
      }
    }

    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    throw error;
  }
}

/**
 * Delete a data file
 */
export function deleteData(filename: string): boolean {
  if (!dataDir) {
    return false;
  }

  const filepath = path.join(dataDir, filename);

  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      logger.debug(`Deleted ${filename}`);
      return true;
    }
  } catch (error) {
    logger.error(`Failed to delete ${filename}`, { error: String(error) });
  }

  return false;
}

/**
 * Check if a data file exists
 */
export function dataExists(filename: string): boolean {
  if (!dataDir) {
    return false;
  }

  const filepath = path.join(dataDir, filename);
  return fs.existsSync(filepath);
}

// ============================================================================
// REPOSITORY PATTERN BASE
// ============================================================================

/**
 * Generic repository interface for domain entities
 */
export interface Repository<T extends { id: string }> {
  findAll(): T[];
  findById(id: string): T | undefined;
  save(entity: T): void;
  delete(id: string): boolean;
  exists(id: string): boolean;
}

/**
 * Create a file-based repository for a collection
 */
export function createRepository<T extends { id: string }>(
  filename: string,
  defaultCollection: T[] = []
): Repository<T> {
  return {
    findAll(): T[] {
      return loadData<T[]>(filename, defaultCollection);
    },

    findById(id: string): T | undefined {
      const collection = loadData<T[]>(filename, defaultCollection);
      return collection.find(item => item.id === id);
    },

    save(entity: T): void {
      const collection = loadData<T[]>(filename, defaultCollection);
      const index = collection.findIndex(item => item.id === entity.id);

      if (index >= 0) {
        collection[index] = entity;
      } else {
        collection.push(entity);
      }

      saveData(filename, collection);
    },

    delete(id: string): boolean {
      const collection = loadData<T[]>(filename, defaultCollection);
      const index = collection.findIndex(item => item.id === id);

      if (index >= 0) {
        collection.splice(index, 1);
        saveData(filename, collection);
        return true;
      }

      return false;
    },

    exists(id: string): boolean {
      const collection = loadData<T[]>(filename, defaultCollection);
      return collection.some(item => item.id === id);
    },
  };
}

// ============================================================================
// SINGLE ENTITY REPOSITORY
// ============================================================================

/**
 * Create a file-based repository for a single entity (e.g., preferences)
 */
export function createSingleEntityRepository<T>(
  filename: string,
  defaultValue: T
): {
  get(): T;
  set(value: T): void;
  reset(): void;
} {
  return {
    get(): T {
      return loadData<T>(filename, defaultValue);
    },

    set(value: T): void {
      saveData(filename, value);
    },

    reset(): void {
      saveData(filename, defaultValue);
    },
  };
}

// ============================================================================
// VERSIONED ENTITY REPOSITORY
// ============================================================================

interface VersionedEntity<T> {
  id: string;
  current: T;
  versions: Array<{
    id: string;
    data: T;
    timestamp: string;
  }>;
}

/**
 * Create a repository with version history
 */
export function createVersionedRepository<T extends { id: string }>(
  filename: string,
  maxVersions: number = 10
): Repository<T> & {
  getVersions(id: string): Array<{ id: string; data: T; timestamp: string }>;
  restore(entityId: string, versionId: string): T | undefined;
} {
  const baseRepo = createRepository<VersionedEntity<T>>(filename, []);

  return {
    findAll(): T[] {
      return baseRepo.findAll().map(v => v.current);
    },

    findById(id: string): T | undefined {
      const versioned = baseRepo.findById(id);
      return versioned?.current;
    },

    save(entity: T): void {
      const existing = baseRepo.findById(entity.id);
      const versions = existing?.versions || [];

      // Add current version to history
      if (existing) {
        versions.push({
          id: `v${Date.now()}`,
          data: existing.current,
          timestamp: new Date().toISOString(),
        });

        // Trim to max versions
        while (versions.length > maxVersions) {
          versions.shift();
        }
      }

      baseRepo.save({
        id: entity.id,
        current: entity,
        versions,
      });
    },

    delete(id: string): boolean {
      return baseRepo.delete(id);
    },

    exists(id: string): boolean {
      return baseRepo.exists(id);
    },

    getVersions(id: string): Array<{ id: string; data: T; timestamp: string }> {
      const versioned = baseRepo.findById(id);
      return versioned?.versions || [];
    },

    restore(entityId: string, versionId: string): T | undefined {
      const versioned = baseRepo.findById(entityId);
      if (!versioned) return undefined;

      const version = versioned.versions.find(v => v.id === versionId);
      if (!version) return undefined;

      // Save the restored version as current
      this.save(version.data);
      return version.data;
    },
  };
}
