export const FINGERPRINT_SQL = `SELECT coalesce(string_agg(line, chr(10) ORDER BY line), '')
FROM (
  SELECT 'enum ' || t.typname || ' ' || e.enumsortorder::text || ' ' || e.enumlabel AS line
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'column ' || c.relname || ' ' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
    || ' null=' || (NOT a.attnotnull)::text
    || ' identity=' || a.attidentity::text
    || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'table_comment ' || c.relname || ' ' || coalesce(obj_description(c.oid, 'pg_class'), '')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 'column_comment ' || c.relname || '.' || a.attname || ' ' || coalesce(col_description(c.oid, a.attnum), '')
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'index ' || indexrelid::regclass::text || ' ' || pg_get_indexdef(indexrelid)
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'function ' || p.proname || ' ' || md5(p.prosrc)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'trigger ' || pg_get_triggerdef(t.oid)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'sequence ' || c.relname || ' start=' || s.seqstart::text || ' inc=' || s.seqincrement::text || ' cycle=' || s.seqcycle::text
  FROM pg_sequence s
  JOIN pg_class c ON c.oid = s.seqrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
) lines`;

export function diffFingerprints(left, right) {
  const leftLines = left.split('\n').filter((line) => line.length > 0);
  const rightLines = right.split('\n').filter((line) => line.length > 0);
  const leftSet = new Set(leftLines);
  const rightSet = new Set(rightLines);
  const onlyLeft = leftLines.filter((line) => !rightSet.has(line));
  const onlyRight = rightLines.filter((line) => !leftSet.has(line));
  return { equal: onlyLeft.length === 0 && onlyRight.length === 0, onlyLeft, onlyRight };
}
