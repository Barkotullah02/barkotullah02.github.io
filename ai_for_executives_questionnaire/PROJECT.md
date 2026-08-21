# NSUTTO AI for Executives — Questionnaire System

> Project documentation. Authoritative reference for the questionnaire
> flow, relational storage model, and the admin/result surfaces.

---

## 1. What this is

A 20-question AI literacy assessment delivered by **North South University
Technology Transfer Office (NSUTTO)** as the final evaluation for the
"AI for Executives" program. The site is part of the static GitHub Pages
repo `Barkotullah02/Barkotullah02.github.io`.

### Pages in the folder

| File                  | Role                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `index.html`          | The questionnaire app (intake → quiz → submit → success).                              |
| `index.js`            | Quiz logic + scoring submission via the `submit_evaluation` RPC.                       |
| `index.css`           | Shared visual system (light palette, navy + gold accents).                            |
| `result.html`         | Admin overview: stats, search by name/email/student ID, expandable per-card details, **Question analysis** (SQL aggregates). |
| `result.js`           | Overview logic — fetches submissions + answers + questions + `question_stats()`.       |
| `result.css`          | Shared styles for overview + per-submission detail + Question analysis.               |
| `single.html`         | Per-submission detail view (hero, score ring, wrong-answer breakdown).                |
| `single.js`           | Detail logic — fetches one submission by id (URL hash) with embedded answers.          |
| `responses.html`      | Alternative dashboard (same data source).                                             |
| `dashboard.js`        | Alternative dashboard logic.                                                          |
| `responses.css`       | Dashboard styling.                                                                    |
| `supabase-schema.sql` | SQL script — run once to create the four tables, indexes, RLS policies, and the two RPC functions. |
| `supabase-seed.sql`   | SQL script — run once to populate the 5 sections + 20 questions.                      |
| `supabase-config.js`  | Holds your Supabase URL + anon public key. Edit before deploying.                     |
| `Final Evaluation.csv` | Source-of-truth question bank (20 questions, 5 sections).                            |
| `logo.png`            | NSUTTO logo used in the header.                                                       |

---

## 2. Architecture

### 2.1 Storage: Supabase (Postgres), fully relational

Four tables, no JSONB blobs of relational data:

| Table         | Rows        | Purpose                                                        |
| ------------- | ----------- | -------------------------------------------------------------- |
| `sections`    | 5           | Question bank sections (reference data).                       |
| `questions`   | 20          | Question bank: prompt, 4 options (jsonb), correct option, reason. |
| `submissions` | one per test-taker | Participant + score + percentage + passed (all server-computed). |
| `answers`     | 20 per submission | One row per (submission × question) with `is_correct` denormalized. |

Why relational matters: **every dashboard query is a real SQL aggregate**.
You can ask "which questions does the cohort get wrong most?", "what's the
pass rate per section?", "what's the score distribution?" — all with
single SQL statements, not by pulling blobs and counting in JS.

### 2.2 Server-side scoring

The form calls `submit_evaluation(full_name, email, student_id, answers, user_agent)`.
This Postgres function (in `supabase-schema.sql`):

1. Pre-checks the email isn't already submitted (clean 23505 error).
2. Validates the answers array has exactly 20 entries.
3. Inserts the `submissions` row inside a transaction.
4. Inserts all 20 `answers` rows, deciding correctness by joining against
   the canonical `correct_option` on the `questions` table.
5. Computes `score`, `percentage`, `passed` from the just-inserted rows.
6. Updates the submission row with those values.
7. Returns the new submission UUID.

**The client cannot fake a score.** Even if someone tampers with the JS
to send a 100% score, the server recomputes from the canonical
`questions.correct_option` and ignores whatever the client claims.

### 2.3 SQL analytics

`question_stats()` (in `supabase-schema.sql`) returns one row per
question with `times_asked`, `times_correct`, and `correct_rate`. The
dashboard calls it once and renders:

* **Hardest questions** (lowest correct rate)
* **Easiest questions** (highest correct rate)
* **Section pass rates**

Anything you can express as `GROUP BY` works directly against the
underlying tables from the Supabase SQL Editor too — no application
layer needed.

### 2.4 Identity intake

Before the quiz shows, the test-taker completes a short intake form:

* **Full name** — required, free text. Appears on their certificate and
  in the admin dashboard.
* **Email address** — required, validated. Unique key on `submissions.email`
  (`citext`, so case-insensitive) — enforced at the database.
* **Student ID** — optional. Searchable in the dashboard.

The **"Start Evaluation"** button is disabled until both required fields
are valid. The form also does a friendly pre-flight check via
`submissions.select` before the user answers 20 questions.

### 2.5 Submit flow

* The submit button calls `submit_evaluation()` once.
* After a successful insert, the form is replaced by an inline
  **"Submitted successfully"** card that thanks them by name. No
  redirect, no download, no modal.

### 2.6 Dashboard pages

There are three admin surfaces — all read-only, no upload/download UI:

* **`result.html`** — primary overview. Stats row (total, avg, pass rate,
  highest), search by name/email/student ID, min/max score + status
  filters, expandable per-card section breakdown and wrong-answer list,
  and the new **Question analysis** block. Each card links to its detail.
* **`responses.html`** — same data, alternate layout. Read-only.
* **`single.html#<submission_uuid>`** — per-submission detail. Hero,
  score ring, summary row, section breakdown, and a focused list of
  every question the participant got wrong.

---

## 3. Data model

### 3.1 `sections`
| Column      | Type   | Notes                          |
| ----------- | ------ | ------------------------------ |
| `id`        | text PK | e.g. `genai`, `llm`, `ml`     |
| `title`     | text   | Display name                   |
| `sort_order`| int    | Render order on the form       |

### 3.2 `questions`
| Column           | Type         | Notes                                 |
| ---------------- | ------------ | ------------------------------------- |
| `id`             | int PK       | 1–20 (matches CSV)                    |
| `section_id`     | text FK     | → `sections.id`                       |
| `prompt`         | text        | Question text                         |
| `options`        | jsonb       | `{"A": "...", "B": "...", ...}`       |
| `correct_option` | text        | `'A' \| 'B' \| 'C' \| 'D'`            |
| `reason`         | text        | Explanation shown in the wrong-answer view |

### 3.3 `submissions`
| Column           | Type         | Notes                                          |
| ---------------- | ------------ | ---------------------------------------------- |
| `id`             | uuid PK      | `gen_random_uuid()`                            |
| `created_at`     | timestamptz  | default `now()`                                |
| `full_name`      | text         | required, ≥ 2 chars                            |
| `email`          | citext       | required, **unique** (case-insensitive)        |
| `student_id`     | text         | nullable                                       |
| `score`          | int          | 0–20, computed server-side                     |
| `total_questions`| int          | always 20                                      |
| `percentage`     | int          | 0–100, computed server-side                    |
| `passed`         | boolean      | computed server-side (≥ 70)                    |
| `user_agent`     | text         | nullable                                       |

### 3.4 `answers`
| Column           | Type         | Notes                                       |
| ---------------- | ------------ | ------------------------------------------- |
| `id`             | bigserial PK |                                             |
| `submission_id`  | uuid FK      | → `submissions.id` ON DELETE CASCADE        |
| `question_id`    | int FK       | → `questions.id`                            |
| `selected_option`| text         | `'A' \| 'B' \| 'C' \| 'D'`                  |
| `is_correct`     | boolean      | denormalized for fast aggregation           |
| `answered_at`    | timestamptz  | default `now()`                             |
| UNIQUE           |              | `(submission_id, question_id)`              |

### 3.5 Indexes
- `submissions_email_unique` (unique on email)
- `answers_submission_id_idx`
- `answers_question_id_idx`
- `answers_is_correct_idx`
- `questions_section_id_idx`

### 3.6 Row Level Security

RLS is enabled on every table. Anon role has:

- `select` on all four
- `insert` on `submissions` + `answers` (used directly for inserts; the
  RPC is `security definer` and bypasses RLS by design)

No `update` or `delete` policies — only the service role can mutate
existing rows. If you ever need to lock down reads, swap the read
policies for the `x-admin-key` variant documented inline in
`supabase-schema.sql`.

---

## 4. Setup (one-time)

1. Sign in / create a free Supabase project: <https://supabase.com>.
2. SQL Editor → paste & run `supabase-schema.sql`. (Drops the old JSONB-blob
   `submissions` table; creates the four new tables + indexes + RLS +
   two RPC functions.)
3. SQL Editor → paste & run `supabase-seed.sql`. (Populates 5 sections
   and 20 questions from the CSV.)
4. Settings → API → copy **Project URL** + **anon public** key into
   `supabase-config.js`.
5. Commit + push.

---

## 5. Question bank

20 questions across 5 sections (4 + 2 + 8 + 4 + 2):

1. **Generative AI & Chatbots** (Q1–Q4)
2. **AI in the Workplace — Case Scenarios** (Q5–Q6)
3. **LLM APIs, Prompts & Tools** (Q7–Q14)
4. **Machine Learning Approaches** (Q15–Q18)
5. **Skills & Workflow Automation** (Q19–Q20)

Pass threshold: **70%**. Status badges:

* `≥ 70%` — **Proficient**
* `50–69%` — **Needs Review**
* `< 50%` — **Further Study**