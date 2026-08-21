/* ====================================================================
   NSUTTO AI Evaluation — All Results Overview (result.html)
   - Fetches submissions + their answers from Supabase
   - Joins with the questions table client-side for prompt text
   - Search by name / email / student ID
   - Min/max score and status filters
   - Expand each card to see what they answered and where they were wrong
   - "Question analysis" block: hardest / easiest questions (SQL RPC)
   ==================================================================== */

(function () {
    'use strict';

    const PASS_THRESHOLD = 70;

    // ----- State -----
    const state = {
        submissions: [],          // normalised rows
        questions:   new Map(),   // id -> { prompt, options, correct_option, section_id }
        sectionTitles: new Map(), // section_id -> title
        questionStats: [],        // result of question_stats() RPC
        filtered: [],
        filters: { search: '', min: null, max: null, status: '' }
    };

    // ----- DOM refs -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const loadingCard = $('#loadingCard');
    const missingCard = $('#missingCard');
    const resultRoot = $('#resultRoot');

    const statTotal = $('#statTotal');
    const statAvg = $('#statAvg');
    const statPassRate = $('#statPassRate');
    const statHighest = $('#statHighest');

    const searchInput = $('#searchInput');
    const filterMin = $('#filterMin');
    const filterMax = $('#filterMax');
    const filterStatus = $('#filterStatus');

    const loadStatus = $('#loadStatus');
    const resultsCount = $('#resultsCount');

    const submissionsList = $('#submissionsList');
    const questionAnalysis = $('#questionAnalysis');
    const toast = $('#toast');

    // ====================================================================
    // Supabase client (lazy)
    // ====================================================================

    let supabaseClient = null;
    function getSupabase() {
        if (supabaseClient) return supabaseClient;
        const cfg = window.NSUTTO_SUPABASE;
        if (!cfg || !cfg.url || cfg.url.includes('YOUR-PROJECT')) return null;
        if (!window.supabase || !window.supabase.createClient) return null;
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
            auth: { persistSession: false }
        });
        return supabaseClient;
    }

    // ====================================================================
    // Row normalisers
    // ====================================================================

    function normaliseSubmission(row) {
        if (!row) return null;
        return {
            id:               row.id,
            timestamp:        row.created_at,
            participant: {
                fullName:  row.full_name,
                email:     row.email,
                studentId: row.student_id || ''
            },
            score:            row.score,
            totalQuestions:   row.total_questions,
            percentage:       row.percentage,
            passed:           row.passed,
            answers:          (row.answers || []).map((a) => ({
                qId:        a.question_id,
                selected:   a.selected_option,
                isCorrect:  a.is_correct
            }))
        };
    }

    function normaliseQuestion(row) {
        return {
            qId:         row.id,
            sectionId:   row.section_id,
            prompt:      row.prompt,
            options:      row.options || {},
            correct:     row.correct_option,
            reason:      row.reason || ''
        };
    }

    function normaliseSection(row) {
        return { id: row.id, title: row.title, sortOrder: row.sort_order };
    }

    // ====================================================================
    // Loading
    // ====================================================================

    async function loadAll() {
        setLoadStatus('Loading…', 'loading');

        const sb = getSupabase();
        if (!sb) {
            setLoadStatus('Supabase is not configured. Edit supabase-config.js.', 'error');
            loadingCard.hidden = true;
            missingCard.hidden = false;
            resultRoot.hidden = true;
            return;
        }

        try {
            // Three independent fetches:
            //  1. submissions + their answers (join via select=*,answers(*))
            //  2. the questions table (for prompt + options text)
            //  3. sections (for section names on the wrong-answer list)
            //  4. question_stats() RPC (cohort correct-rate per question)
            const [subsRes, qsRes, secRes, qsStatsRes] = await Promise.all([
                sb.from('submissions').select('*, answers(*)').order('created_at', { ascending: false }),
                sb.from('questions').select('*'),
                sb.from('sections').select('*'),
                sb.rpc('question_stats')
            ]);

            if (subsRes.error) throw subsRes.error;
            if (qsRes.error)    throw qsRes.error;
            if (secRes.error)   throw secRes.error;
            if (qsStatsRes.error) throw qsStatsRes.error;

            state.submissions = (subsRes.data || [])
                .map(normaliseSubmission)
                .filter(Boolean);

            state.questions = new Map(
                (qsRes.data || []).map(normaliseQuestion).map((q) => [q.qId, q])
            );

            state.sectionTitles = new Map(
                (secRes.data || []).map(normaliseSection).map((s) => [s.id, s.title])
            );

            state.questionStats = qsStatsRes.data || [];

            if (state.submissions.length === 0) {
                loadingCard.hidden = true;
                missingCard.hidden = false;
                resultRoot.hidden = true;
                setLoadStatus('No submissions yet', '');
                return;
            }

            loadingCard.hidden = true;
            missingCard.hidden = true;
            resultRoot.hidden = false;

            applyFilters();
            updateStats();
            renderQuestionAnalysis();
            setLoadStatus(
                `${state.submissions.length} submission${state.submissions.length === 1 ? '' : 's'} loaded from Supabase`,
                'success'
            );
        } catch (err) {
            console.error(err);
            const msg = err && err.message ? err.message : 'Unknown error';
            setLoadStatus('Failed to load: ' + msg, 'error');
            loadingCard.hidden = true;
            missingCard.hidden = true;
            resultRoot.hidden = true;
            showToast('Failed to load submissions.', 'error');
        }
    }

    // ====================================================================
    // Section scores (derived from joined answers + questions)
    // ====================================================================

    function computeSectionScores(submission) {
        const bySection = {};
        submission.answers.forEach((a) => {
            const q = state.questions.get(a.qId);
            if (!q) return;
            if (!bySection[q.sectionId]) bySection[q.sectionId] = { correct: 0, total: 0 };
            bySection[q.sectionId].total += 1;
            if (a.isCorrect) bySection[q.sectionId].correct += 1;
        });
        const out = {};
        Object.keys(bySection).forEach((sid) => {
            const s = bySection[sid];
            out[state.sectionTitles.get(sid) || sid] = {
                correct: s.correct,
                total: s.total,
                pct: s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100)
            };
        });
        return out;
    }

    // ====================================================================
    // Filtering & rendering — submission list
    // ====================================================================

    function participantText(s) {
        const p = s.participant || {};
        return [p.fullName, p.email, p.studentId].filter(Boolean).join(' ');
    }

    function applyFilters() {
        const f = state.filters;
        const search = f.search.trim().toLowerCase();
        state.filtered = state.submissions.filter((s) => {
            if (search) {
                const identity = participantText(s).toLowerCase();
                if (!identity.includes(search)) return false;
            }
            if (f.min !== null && s.percentage < f.min) return false;
            if (f.max !== null && s.percentage > f.max) return false;
            if (f.status === 'passed' && s.percentage < PASS_THRESHOLD) return false;
            if (f.status === 'review' && (s.percentage >= PASS_THRESHOLD || s.percentage < 50)) return false;
            if (f.status === 'low' && s.percentage >= 50) return false;
            return true;
        });

        render();
        resultsCount.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? '' : 's'}`;
    }

    function render() {
        submissionsList.innerHTML = '';
        if (state.filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'no-results';
            empty.textContent = 'No submissions match your filters.';
            submissionsList.appendChild(empty);
            return;
        }
        state.filtered.forEach((s, idx) => {
            const card = renderSubmissionCard(s);
            card.style.animationDelay = (idx * 30) + 'ms';
            submissionsList.appendChild(card);
        });
    }

    function renderSubmissionCard(s) {
        const card = document.createElement('article');
        card.className = 'submission-card';

        const statusClass = getStatusClass(s.percentage);
        const date = formatDate(s.timestamp);
        const statusLabel = getStatusLabel(s.percentage);
        const p = s.participant || {};
        const name = p.fullName || '(no name)';
        const email = p.email || '';
        const studentId = p.studentId || '';
        const sectionScores = computeSectionScores(s);
        const wrongAnswers = (s.answers || []).filter((a) => !a.isCorrect);
        const wrongCount = wrongAnswers.length;
        const singleHref = `single.html#${encodeURIComponent(s.id)}`;

        card.innerHTML = `
            <div class="submission-head" data-toggle>
                <div class="score-display ${statusClass}">
                    <div class="score-pct">${s.percentage}%</div>
                    <div class="score-of">${s.score}/${s.totalQuestions}</div>
                </div>
                <div class="submission-meta">
                    <div class="participant-name">${escapeHtml(name)}</div>
                    <div class="participant-contact">
                        ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '<span class="muted">no email</span>'}
                        ${studentId ? `<span class="dot-sep">•</span><span class="sid">${escapeHtml(studentId)}</span>` : ''}
                    </div>
                    <div class="submission-date">${escapeHtml(date)} · ${wrongCount} wrong</div>
                </div>
                <span class="submission-status ${statusClass}">${statusLabel}</span>
                <a class="submission-result-link" href="${singleHref}" title="Open detail page">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
                <button class="submission-toggle" aria-label="Expand details" type="button">
                    <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="submission-body">
                <div class="submission-body-inner">
                    <div class="section-bars">
                        <div class="section-bars-title">Section Breakdown</div>
                        ${renderSectionBars(sectionScores)}
                    </div>
                    <div class="answers-list">
                        <div class="answers-title">Where they went wrong (${wrongCount})</div>
                        ${renderAnswers(wrongAnswers)}
                    </div>
                </div>
            </div>
        `;

        card.querySelector('[data-toggle]').addEventListener('click', () => {
            card.classList.toggle('open');
        });
        card.querySelector('.submission-result-link').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        return card;
    }

    function renderSectionBars(sectionScores) {
        if (!sectionScores) return '<p style="color:var(--ink-muted);font-size:13px;">No section data.</p>';
        return Object.entries(sectionScores).map(([name, data]) => `
            <div class="section-bar-row">
                <div class="section-bar-head">
                    <span class="section-bar-name">${escapeHtml(name)}</span>
                    <span class="section-bar-score">${data.correct} / ${data.total} (${data.pct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${data.pct}%"></div>
                </div>
            </div>
        `).join('');
    }

    function renderAnswers(wrongAnswers) {
        if (wrongAnswers.length === 0) {
            return '<div class="wrong-empty-inline">No wrong answers — perfect score.</div>';
        }
        return wrongAnswers.map((a) => {
            const q = state.questions.get(a.qId);
            const prompt   = q ? q.prompt     : `Question ${a.qId}`;
            const correct  = q ? q.correct    : '?';
            const correctText = q && q.options ? q.options[correct] : '';
            const selectedText = q && q.options ? q.options[a.selected] : '';
            const reason   = q ? q.reason     : '';
            return `
                <div class="answer-row incorrect">
                    <div class="answer-marker">✗</div>
                    <div class="answer-content">
                        <p class="answer-q">Q${a.qId}. ${escapeHtml(prompt)}</p>
                        <p class="answer-detail">
                            <strong>Selected:</strong>
                            <span class="selected-letter">${escapeHtml(a.selected)}</span>
                            — ${escapeHtml(selectedText)}
                            <br>
                            <span style="color:var(--ink-faint);">Correct: <span class="correct-letter">${escapeHtml(correct)}</span> — ${escapeHtml(correctText)}</span>
                            ${reason ? `<br><span class="answer-reason">${escapeHtml(reason)}</span>` : ''}
                        </p>
                    </div>
                    <span class="answer-tag incorrect">INCORRECT</span>
                </div>
            `;
        }).join('');
    }

    // ====================================================================
    // Question analysis block (from question_stats() RPC)
    // ====================================================================

    function renderQuestionAnalysis() {
        if (!questionAnalysis) return;
        questionAnalysis.innerHTML = '';

        const asked = state.questionStats.filter((q) => Number(q.times_asked) > 0);
        if (asked.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'qa-empty';
            empty.textContent = 'No answers yet — question analysis will appear once participants submit.';
            questionAnalysis.appendChild(empty);
            return;
        }

        const sorted = [...asked].sort((a, b) => Number(a.correct_rate) - Number(b.correct_rate));
        const hardest = sorted.slice(0, 5);
        const easiest = [...sorted].reverse().slice(0, 5);

        // Cohort summary by section
        const sectionTotals = {};
        asked.forEach((q) => {
            const key = q.section_id;
            if (!sectionTotals[key]) sectionTotals[key] = { asked: 0, correct: 0, title: q.section_title || key };
            sectionTotals[key].asked   += Number(q.times_asked);
            sectionTotals[key].correct += Number(q.times_correct);
        });
        const sectionRows = Object.values(sectionTotals).map((s) => ({
            title: s.title,
            asked: s.asked,
            correct: s.correct,
            pct: s.asked === 0 ? 0 : Math.round((s.correct / s.asked) * 100)
        }));

        questionAnalysis.appendChild(qaList('Hardest questions (cohort got wrong most)', hardest, true));
        questionAnalysis.appendChild(qaList('Easiest questions', easiest, false));
        questionAnalysis.appendChild(qaSectionList(sectionRows));
    }

    function qaList(title, rows, isHard) {
        const block = document.createElement('div');
        block.className = 'qa-block';
        block.innerHTML = `
            <h3 class="qa-title">${escapeHtml(title)}</h3>
            <ol class="qa-list">
                ${rows.map((q) => `
                    <li class="qa-item ${isHard ? 'hard' : 'easy'}">
                        <div class="qa-row-head">
                            <span class="qa-num">Q${q.question_id}</span>
                            <span class="qa-section">${escapeHtml(q.section_title || '')}</span>
                            <span class="qa-rate">${q.correct_rate}%</span>
                            <span class="qa-count">${q.times_correct} / ${q.times_asked} correct</span>
                        </div>
                        <div class="qa-prompt">${escapeHtml(q.prompt)}</div>
                        <div class="qa-bar">
                            <div class="qa-bar-fill ${isHard ? 'hard' : 'easy'}" style="width: ${Math.max(2, Math.round(Number(q.correct_rate)))}%"></div>
                        </div>
                    </li>
                `).join('')}
            </ol>
        `;
        return block;
    }

    function qaSectionList(rows) {
        const block = document.createElement('div');
        block.className = 'qa-block qa-section-block';
        const max = Math.max(1, ...rows.map((r) => r.pct));
        block.innerHTML = `
            <h3 class="qa-title">Section pass rates</h3>
            <div class="qa-section-list">
                ${rows.map((r) => `
                    <div class="qa-section-row">
                        <div class="qa-section-row-head">
                            <span class="qa-section-name">${escapeHtml(r.title)}</span>
                            <span class="qa-section-rate">${r.pct}% <span class="qa-section-count">(${r.correct}/${r.asked})</span></span>
                        </div>
                        <div class="qa-bar">
                            <div class="qa-bar-fill" style="width: ${Math.round((r.pct / max) * 100)}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return block;
    }

    // ====================================================================
    // Stats
    // ====================================================================

    function updateStats() {
        const total = state.submissions.length;
        if (total === 0) {
            statTotal.textContent = '0';
            statAvg.textContent = '—';
            statPassRate.textContent = '—';
            statHighest.textContent = '—';
            return;
        }

        const percentages = state.submissions.map((s) => s.percentage || 0);
        const avg = Math.round(percentages.reduce((a, b) => a + b, 0) / total);
        const passed = state.submissions.filter((s) => (s.percentage || 0) >= PASS_THRESHOLD).length;
        const passRate = Math.round((passed / total) * 100);
        const highest = Math.max(...percentages);

        statTotal.textContent = String(total);
        statAvg.textContent = avg + '%';
        statPassRate.textContent = passRate + '%';
        statHighest.textContent = highest + '%';
    }

    // ====================================================================
    // Helpers
    // ====================================================================

    function getStatusClass(pct) {
        if (pct >= PASS_THRESHOLD) return 'passed';
        if (pct >= 50) return 'review';
        return 'low';
    }

    function getStatusLabel(pct) {
        if (pct >= PASS_THRESHOLD) return 'PROFICIENT';
        if (pct >= 50) return 'REVIEW';
        return 'LOW';
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return iso;
        }
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    let toastTimer;
    function showToast(message, kind) {
        toast.textContent = message;
        toast.hidden = false;
        toast.style.background = kind === 'error' ? 'var(--error)' : 'var(--ink)';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.hidden = true;
        }, 3200);
    }

    function setLoadStatus(text, kind) {
        loadStatus.textContent = text;
        loadStatus.classList.remove('loading', 'success', 'error');
        if (kind) loadStatus.classList.add(kind);
    }

    function readFilters() {
        state.filters.search = searchInput.value.trim();
        state.filters.min = filterMin.value === '' ? null : Math.max(0, Math.min(100, Number(filterMin.value)));
        state.filters.max = filterMax.value === '' ? null : Math.max(0, Math.min(100, Number(filterMax.value)));
        state.filters.status = filterStatus.value;
    }

    function onFilterChange() {
        readFilters();
        applyFilters();
    }

    // ====================================================================
    // Init
    // ====================================================================

    function init() {
        document.getElementById('year').textContent = new Date().getFullYear();

        searchInput.addEventListener('input', onFilterChange);
        filterMin.addEventListener('input', onFilterChange);
        filterMax.addEventListener('input', onFilterChange);
        filterStatus.addEventListener('change', onFilterChange);

        loadAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();