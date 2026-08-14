export interface NoxDatabaseEnv {
  NOX_DB?: D1Database;
  DB?: D1Database;
}

/** Resolve the single shared Nox database across product Workers. */
export function getNoxDb(env: NoxDatabaseEnv): D1Database {
  const db = env.NOX_DB ?? env.DB;
  if (!db) throw new Error("NOX_DB binding is required");
  return db;
}
