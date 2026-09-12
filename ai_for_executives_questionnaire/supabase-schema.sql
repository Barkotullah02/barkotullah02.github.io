-- =====================================================================
-- NSUTTO AI Evaluation — Supabase schema (relational)
--
-- Four tables, real columns, no JSONB blobs of relational data:
--   sections       — 5 rows, the question bank sections
--   questions      — 20 rows, the question bank
--   submissions    — one row per test-taker
--   answers        — one row per (submission × question)
--
-- Scoring is computed server-side by submit_evaluation() inside a single
-- transaction; the form's score claim is never trusted.
--
-- After running this file, also run supabase-seed.sql to populate
-- sections + questions.
-- =====================================================================

create extension if not exists "pgcrypto";   -- for gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- =====================================================================
-- Drop prior objects (safe to re-run during development)
-- =====================================================================
drop table if exists public.answers         cascade;
drop table if exists public.submissions     cascade;
drop table if exists public.questions       cascade;
drop table if exists public.sections        cascade;

drop function if exists public.submit_evaluation(text, text, text, jsonb, text);
drop function if exists public.question_stats();

-- =====================================================================
-- sections  (reference data)
-- =====================================================================
create table public.sections (
    id         text primary key,
    title      text not null,
    sort_order int  not null
);

-- =====================================================================
-- questions  (reference data)
-- =====================================================================
create table public.questions (
    id             int  primary key,
    section_id     text not null references public.sections(id) on delete cascade,
    prompt         text not null,
    options        jsonb not null,         -- {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_option text not null check (correct_option in ('A','B','C','D')),
    reason         text
);

create index questions_section_id_idx on public.questions (section_id);

-- =====================================================================
-- submissions  (one row per test-taker)
-- =====================================================================
create table public.submissions (
    id              uuid primary key default gen_random_uuid(),
    created_at      timestamptz not null default now(),
    full_name       text        not null check (length(full_name) >= 2),
    email           citext      not null,
    student_id      text,
    score           int         not null default 0,
    total_questions int         not null default 20,
    percentage      int         not null default 0,
    passed          boolean     not null default false,
    user_agent      text
);

-- One submission per email (case-insensitive thanks to citext).
create unique index submissions_email_unique on public.submissions (email);

-- =====================================================================
-- answers  (one row per submission × question)
-- =====================================================================
create table public.answers (
    id              bigserial primary key,
    submission_id   uuid        not null references public.submissions(id) on delete cascade,
    question_id     int         not null references public.questions(id),
    selected_option text        not null check (selected_option in ('A','B','C','D')),
    is_correct      boolean     not null,
    answered_at     timestamptz not null default now(),
    unique (submission_id, question_id)
);

create index answers_submission_id_idx on public.answers (submission_id);
create index answers_question_id_idx    on public.answers (question_id);
create index answers_is_correct_idx     on public.answers (is_correct);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.sections     enable row level security;
alter table public.questions    enable row level security;
alter table public.submissions  enable row level security;
alter table public.answers      enable row level security;

-- Reference data: read-only for anon.
create policy "anon can read sections"
    on public.sections for select to anon using (true);

create policy "anon can read questions"
    on public.questions for select to anon using (true);

-- submissions + answers: anon can insert and read.
-- Inserts go through submit_evaluation() (security definer), but direct
-- inserts are also allowed so the policy is permissive.
create policy "anon can insert submission"
    on public.submissions for insert to anon with check (true);

create policy "anon can insert answers"
    on public.answers for insert to anon with check (true);

create policy "anon can read submissions"
    on public.submissions for select to anon using (true);

create policy "anon can read answers"
    on public.answers for select to anon using (true);

-- No update / delete policies — only the service role can mutate rows
-- after insertion.

-- =====================================================================
-- submit_evaluation(p_full_name, p_email, p_student_id, p_answers, p_user_agent)
--
-- Atomic form-submit handler. Returns the new submission UUID on success.
-- Raises 23505 if the email is already in use.
-- =====================================================================
create or replace function public.submit_evaluation(
    p_full_name text,
    p_email     text,
    p_student_id text,
    p_answers   jsonb,        -- [{"question_id": 1, "selected": "C"}, ...]
    p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_submission_id uuid := gen_random_uuid();
    v_score int;
    v_total int;
    v_pct   int;
    v_passed boolean;
    v_expected_count int;
begin
    -- Pre-check email uniqueness (the unique index will also catch it,
    -- but this gives a cleaner error code path).
    if exists (select 1 from public.submissions where email = lower(p_email)) then
        raise exception 'A submission already exists for this email.'
            using errcode = '23505';
    end if;

    -- Validate we got exactly the expected number of answers (20).
    select count(*) into v_expected_count from jsonb_array_elements(p_answers);
    if v_expected_count <> 20 then
        raise exception 'Expected 20 answers, got %', v_expected_count
            using errcode = '22023';
    end if;

    -- Insert the submission row first (placeholder score; computed below).
    insert into public.submissions (id, full_name, email, student_id, score, total_questions, percentage, passed, user_agent)
    values (v_submission_id,
            p_full_name,
            lower(p_email),
            nullif(btrim(p_student_id), ''),
            0,
            20,
            0,
            false,
            nullif(btrim(p_user_agent), ''));

    -- Insert all 20 answer rows; correctness is decided by joining the
    -- canonical correct_option on the questions table.
    insert into public.answers (submission_id, question_id, selected_option, is_correct)
    select v_submission_id,
           (a->>'question_id')::int,
           a->>'selected',
           (a->>'selected') = q.correct_option
      from jsonb_array_elements(p_answers) a
      join public.questions q on q.id = (a->>'question_id')::int;

    -- Score from the just-inserted answers.
    select count(*) filter (where is_correct),
           count(*)
      into v_score, v_total
      from public.answers
     where submission_id = v_submission_id;

    v_pct    := round((v_score::numeric / v_total) * 100);
    v_passed := v_pct >= 70;

    update public.submissions
       set score      = v_score,
           percentage = v_pct,
           passed     = v_passed
     where id = v_submission_id;

    return v_submission_id;
end;
$$;

grant execute on function public.submit_evaluation(text, text, text, jsonb, text) to anon;

-- =====================================================================
-- question_stats()  — per-question cohort analysis
--
-- Returns one row per question with times_asked, times_correct, and
-- correct_rate (NULL if never attempted). Used by the dashboard to
-- render the "Hardest questions" / "Easiest questions" block.
-- =====================================================================
create or replace function public.question_stats()
returns table (
    question_id    int,
    section_id     text,
    section_title  text,
    prompt         text,
    options        jsonb,
    correct_option text,
    times_asked    bigint,
    times_correct  bigint,
    correct_rate   numeric
)
language sql
security definer
set search_path = public
as $$
    select
        q.id,
        q.section_id,
        s.title,
        q.prompt,
        q.options,
        q.correct_option,
        count(a.id)                                            as times_asked,
        count(a.id) filter (where a.is_correct)                as times_correct,
        case when count(a.id) = 0 then null
             else round(
                (count(a.id) filter (where a.is_correct)::numeric
                 / count(a.id)) * 100, 1)
        end                                                    as correct_rate
    from public.questions q
    left join public.sections s on s.id = q.section_id
    left join public.answers   a on a.question_id = q.id
    group by q.id, q.section_id, s.title, q.prompt, q.options, q.correct_option, s.sort_order
    order by s.sort_order, q.id;
$$;

grant execute on function public.question_stats() to anon;
