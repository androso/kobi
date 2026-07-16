-- The shared-library migration supersedes the former one-active-source model.
-- Keep this later migration idempotent for databases that previously applied it.
drop function if exists finalize_curriculum_source_ingest(uuid, uuid, integer, integer);
