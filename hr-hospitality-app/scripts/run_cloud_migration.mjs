/**
 * LEGACY ENTRYPOINT — intentionally disabled.
 *
 * The old script executed a non-canonical SQL file and continued after
 * statement errors. Use scripts/run_migrations.mjs with the versioned
 * migrations/sqlite or migrations/supabase directory instead.
 */
console.error('ERRO: run_cloud_migration.mjs foi desativado.');
console.error('Use: node scripts/run_migrations.mjs --target=supabase --snapshot');
process.exitCode = 1;
