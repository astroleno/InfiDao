// SQLite is a local, immutable index file, not a database service. Loaded only
// for the optional package; core reading remains available on older Node hosts.
export type SQLiteRow = Record<string, string | number | Uint8Array | null>;
export interface ContentDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => { get: (...values: Array<string | number>) => SQLiteRow | undefined; all: (...values: Array<string | number>) => SQLiteRow[] };
  close: () => void;
}
export function openContentDatabase(file: string): ContentDatabase {
  // Resolve the native builtin at runtime. Turbopack's CommonJS URL external
  // handling predates node:sqlite and otherwise marks a healthy pack unusable.
  const node = process as typeof process & { getBuiltinModule?: (name: string) => unknown };
  const sqlite = node.getBuiltinModule?.('node:sqlite') as { DatabaseSync?: new (file: string, options: { readOnly: boolean }) => ContentDatabase } | undefined;
  if (!sqlite?.DatabaseSync) throw new Error('Poetry index requires Node 22.13+ with SQLite');
  const database = new sqlite.DatabaseSync(file, { readOnly: true });
  database.exec('PRAGMA query_only=ON; PRAGMA cache_size=-1024; PRAGMA mmap_size=0;');
  return database;
}
