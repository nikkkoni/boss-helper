export interface StorageMigrationAdapter {
  storageGet<T>(key: string): Promise<T | null>
  storageSet<T>(key: string, value: T): Promise<unknown>
  storageRm(key: string): Promise<unknown>
}

export interface StorageKeyMigration<T = unknown> {
  newKey: string
  oldKey: string
  transform?: (value: T) => Promise<T> | T
}

export async function migrateStorageKey<T>(
  oldKey: string,
  newKey: string,
  storage: StorageMigrationAdapter,
  transform?: StorageKeyMigration<T>['transform'],
) {
  const existing = await storage.storageGet<T>(newKey)
  if (existing != null) {
    return existing
  }

  const legacy = await storage.storageGet<T>(oldKey)
  if (legacy == null) {
    return null
  }

  const migrated = transform ? await transform(legacy) : legacy
  await storage.storageSet(newKey, migrated)
  await storage.storageRm(oldKey)
  return migrated
}

export async function migrateStorageKeys(
  migrations: readonly StorageKeyMigration[],
  storage: StorageMigrationAdapter,
) {
  return Promise.all(
    migrations.map((migration) =>
      migrateStorageKey(migration.oldKey, migration.newKey, storage, migration.transform),
    ),
  )
}
