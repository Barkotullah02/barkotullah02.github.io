/* ====================================================================
   NSUTTO AI Evaluation — Submissions Dashboard Logic
   - Fetches submissions + their answers from Supabase
   - Joins with the questions table for prompt text
   - Search by name / email / student ID
   - Min/max score + status filters
   - Expand cards to see what each person answered
   ==================================================================== */

(function () {
    'use strict';

    const PASS_THRESHOLD = 70;

    // ----- State -----
    const state = {
        submissions: [],
        questions:   new Map(),
        sectionTitles: new Map(),
        filtered: [],
        filters: { search: '', min: null, max: null, status: '' }
    };

    // ----- DOM refs -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const submissionsList = $('#submissionsList');
    const emptyState = $('#emptyState');
    const resultsCount = $('#resultsCount');

    const statTotal = $('#statTotal');
    const statAvg = $('#statAvg');
    const statPassRate = $('#statPassRate');
    const statHighest = $('#statHighest');

    const searchInput = $('#searchInput');
    const filterMin = $('#filterMin');
    const filterMax = $('#filterMax');
    const filterStatus = $('#filterStatus');

    const loadStatus = $('#loadStatus');

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

    // ====================================================================
    // Loading
    // ====================================================================

    async function loadAll() {
        setLoadStatus('Loading…', 'loading');

        const sb = getSupabase();
        if (!sb) {
            setLoadStatus('Supabase is not configured. Edit supabase-config.js.', 'error');
            applyFilters();
            updateStats();
            return;
        }

        try {
            const [subsRes, qsRes, secRes] = await Promise.all([
                sb.from('submissions').select('*, answers(*)').order('created_at', { ascending: false }),
                sb.from('questions').select('*'),
                sb.from('sections').select('*')
            ]);
            if (subsRes.error) throw subsRes.error;
            if (qsRes.error)    throw qsRes.error;
            if (secRes.error)   throw secRes.error;

            state.submissions = (subsRes.data || [])
                .map(normaliseSubmission)
                .filter(Boolean);

            state.questions = new Map(
                (qsRes.data || []).map((q) => [q.id, q])
            );
            state.sectionTitles = new Map(
                (secRes.data || []).map((s) => [s.id, s.title])
            );

            applyFilters();
            updateStats();

            const total = state.submissions.length;
            if (total === 0) {
                setLoadStatus('No submissions yet', '');
            } else {
                setLoadStatus(`${total} submission${total === 1 ? '' : 's'} loaded from Supabase`, 'success');
            }
        } catch (err) {
            console.error(err);
            setLoadStatus('Failed to load: ' + (err.message || 'unknown error'), 'error');
            showToast('Failed to load submissions.', 'error');
        }
    }

    function computeSectionScores(s) {
        const bySection = {};
        s.answers.forEach((a) => {
            const q = state.questions.get(a.qId);
            if (!q) return;
            if (!bySection[q.section_id]) bySection[q.section_id] = { correct: 0, total: 0 };
            bySection[q.section_id].total += 1;
            if (a.isCorrect) bySection[q.section_id].correct += 1;
        });
        const out = {};
        Object.keys(bySection).forEach((sid) => {
            const r = bySection[sid];
            out[state.sectionTitles.get(sid) || sid] = {
                correct: r.correct,
                total: r.total,
                pct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100)
            };
        });
        return out;
    }

    // ====================================================================
    // Filtering & rendering
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
            emptyState.hidden = state.submissions.length === 0;
            return;
        }
        emptyState.hidden = true;

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
                    <div class="submission-date">${escapeHtml(date)}</div>
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
            const prompt   = q ? q.prompt : `Question ${a.qId}`;
            const correct  = q ? q.correct_option : '?';
            const correctText  = q && q.options ? q.options[correct] : '';
            const selectedText = q && q.options ? q.options[a.selected] : '';
            const reason   = q ? q.reason : '';
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