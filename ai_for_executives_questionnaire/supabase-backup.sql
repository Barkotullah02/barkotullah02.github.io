-- =====================================================================
-- NSUTTO AI Evaluation — Backup step (run BEFORE supabase-schema.sql)
--
-- Snapshots the existing public.submissions table into a holding
-- table that survives the new schema's drop. After running
-- supabase-schema.sql + supabase-seed.sql + supabase-migrate.sql,
-- your old submissions will appear in the new relational tables.
-- =====================================================================

drop table if exists public._old_submissions;

create table public._old_submissions as
    select * from public.submissions;

-- Sanity check
select count(*) as preserved from public._old_submissions;