// Point every test at an isolated SQLite database and safe defaults.
// Runs in each worker before test modules (and lib/db) are imported.
process.env.DATABASE_URL = "file:./test.db";
process.env.APPLY_MODE = process.env.APPLY_MODE ?? "dry_run";
delete process.env.OPENAI_API_KEY; // force the deterministic resume fallback
