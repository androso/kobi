-- Commit the new enum value before later migrations use it in data updates.
alter type curriculum_source_status add value if not exists 'cleanup_pending';
