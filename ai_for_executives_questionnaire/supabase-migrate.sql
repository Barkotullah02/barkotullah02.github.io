-- =====================================================================
-- NSUTTO AI Evaluation — Optional one-shot data migration
--
-- If you had submissions in the old JSONB-blob schema and want to
-- preserve them across the migration to the new relational schema,
-- run this AFTER the new supabase-schema.sql + supabase-seed.sql.
--
-- It walks the OLD public.submissions table (before the schema drop
-- happened) and re-inserts them into the new submissions + answers
-- tables.
--
-- THIS SCRIPT assumes you ran supabase-schema.sql which already
-- DROPPED the old submissions table. If your old submissions table
-- is gone, there's nothing to migrate.
-- =====================================================================

-- If the old submissions table no longer exists, this is a no-op.
do $$
declare
    r record;
    v_new_id uuid;
    v_score int;
    v_total int;
    v_pct int;
    v_passed boolean;
    v_has_old boolean;
begin
    select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = '_old_submissions'
    ) into v_has_old;

    if not v_has_old then
        raise notice 'No _old_submissions holding table found — nothing to migrate.';
        return;
    end if;

    for r in
        select * from public._old_submissions
    loop
        -- Skip if a row with the same email already exists in the new table
        if exists (select 1 from public.submissions where email = lower(r.participant->>'email')) then
            continue;
        end if;

        v_new_id := gen_random_uuid();
        v_score  := coalesce((r.participant->>'score')::int, r.score);
        v_total  := coalesce(r.total_questions, 20);
        v_pct    := coalesce(r.percentage, round((v_score::numeric / v_total) * 100));
        v_passed := coalesce(r.passed, v_pct >= 70);

        insert into public.submissions (id, created_at, full_name, email, student_id, score, total_questions, percentage, passed)
        values (
            v_new_id,
            coalesce(r.timestamp, r.created_at, now()),
            r.participant->>'fullName',
            lower(r.participant->>'email'),
            nullif(r.participant->>'studentId', ''),
            v_score,
            v_total,
            v_pct,
            v_passed
        );

        -- Best-effort: insert answers from the old JSON blob if present
        if jsonb_typeof(r.answers) = 'array' then
            insert into public.answers (submission_id, question_id, selected_option, is_correct)
            select v_new_id,
                   (a->>'qId')::int,
                   a->>'selected',
                   coalesce((a->>'isCorrect')::boolean, false)
              from jsonb_array_elements(r.answers) a
             where (a->>'qId') is not null and (a->>'selected') is not null
            on conflict (submission_id, question_id) do nothing;
        end if;
    end loop;
end $$;

drop table if exists public._old_submissions;