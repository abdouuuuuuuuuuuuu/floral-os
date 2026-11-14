// Usage: node scripts/gen-migration-audit.mjs supabase/migrations supabase/checks/migration_history_audit.sql
// Reads every migration and writes a read-only SQL query that reports, per
// migration, how many of the objects it creates exist in the database.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [dir, out] = process.argv.slice(2)
const rows = []
const q = (s) => `'${String(s).replaceAll("'", "''")}'`
const strip = (s) => s.replace(/"/g, '').replace(/^public\./i, '')

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const version = file.split('_')[0]
  // Drop comments so commented-out SQL is not counted.
  const sql = readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '')
  const seen = new Set()
  const add = (kind, name, table = '') => {
    const key = `${kind}|${name}|${table}`.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    rows.push(`(${q(version)}, ${q(kind)}, ${q(name)}, ${q(table)})`)
  }
  for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\(/gi)) add('function', strip(m[1]))
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)) add('table', strip(m[1]))
  for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([\w."]+)/gi)) add('view', strip(m[1]))
  for (const m of sql.matchAll(/CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([\w"]+)\s[\s\S]*?\sON\s+([\w."]+)/gi)) add('trigger', strip(m[1]), strip(m[2]))
  for (const m of sql.matchAll(/CREATE\s+POLICY\s+([\w"]+)\s+ON\s+([\w."]+)/gi)) add('policy', strip(m[1]), strip(m[2]))
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)([\s\S]*?);/gi)) {
    for (const c of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi)) add('column', strip(c[1]), strip(m[1]))
  }
  for (const m of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi)) add('index', strip(m[1]))
}

const query = `-- READ-ONLY. Generated from supabase/migrations by scripts/gen-migration-audit.
-- For each migration: how many of the objects it creates exist in the database.
--   all present  -> almost certainly applied
--   none present -> not applied
--   some present -> partly applied, or a later migration dropped/replaced objects
-- A function that exists may still be an OLDER version: this cannot see function
-- bodies. Migrations with 0 objects only change data or permissions; check by hand.
-- Run in the Supabase SQL Editor. It changes nothing.
WITH expected(version, kind, name, tbl) AS (
  VALUES
  ${rows.join(',\n  ')}
),
checked AS (
  SELECT e.*,
    CASE e.kind
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = lower(e.name))
      WHEN 'table'    THEN to_regclass('public.' || lower(e.name)) IS NOT NULL
      WHEN 'view'     THEN to_regclass('public.' || lower(e.name)) IS NOT NULL
      WHEN 'index'    THEN to_regclass('public.' || lower(e.name)) IS NOT NULL
      WHEN 'column'   THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = lower(e.tbl) AND c.column_name = lower(e.name))
      WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname = lower(e.tbl) AND t.tgname = lower(e.name))
      WHEN 'policy'   THEN EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = lower(e.tbl) AND p.policyname = lower(e.name))
    END AS present
  FROM expected e
)
SELECT
  version,
  count(*) FILTER (WHERE present) AS present,
  count(*) AS expected,
  CASE
    WHEN count(*) FILTER (WHERE present) = count(*) THEN 'applied'
    WHEN count(*) FILTER (WHERE present) = 0 THEN 'NOT APPLIED'
    ELSE 'PARTIAL'
  END AS verdict,
  string_agg(CASE WHEN NOT present THEN kind || ' ' || CASE WHEN tbl <> '' THEN tbl || '.' ELSE '' END || name END, ', ') AS missing
FROM checked
GROUP BY version
ORDER BY version;
`
writeFileSync(out, query)
console.log(`${rows.length} objects from ${new Set(rows.map((r) => r.slice(2, 16))).size} migrations`)
