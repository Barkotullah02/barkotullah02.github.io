/* ====================================================================
   NSUTTO AI Evaluation — Responses Dashboard Logic
   - Loads from localStorage + GitHub Contents API
   - Search, filter, expand
   - Export to JSON & CSV
   ==================================================================== */

(function () {
    'use strict';

    // ----- Configuration -----
    const REPO = 'Barkotullah02/Barkotullah02.github.io';
    const RESPONSES_DIR = 'ai_for_executives_questionnaire/responses';
    const API_BASE = `https://api.github.com/repos/${REPO}/contents/${RESPONSES_DIR}`;
    const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/${RESPONSES_DIR}`;
    const STORAGE_KEY = 'nsutto_evaluations';
    const TOKEN_KEY = 'github_token';
    const PASS_THRESHOLD = 70;

    // ----- State -----
    const state = {
        submissions: [],
        filtered: [],
        filters: {
            search: '',
            min: null,
            max: null,
            status: ''
        },
        loading: false
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

    const refreshBtn = $('#refreshBtn');
    const exportJsonBtn = $('#exportJsonBtn');
    const exportCsvBtn = $('#exportCsvBtn');
    const loadStatus = $('#loadStatus');

    const tokenInput = $('#tokenInput');
    const saveTokenBtn = $('#saveTokenBtn');
    const clearTokenBtn = $('#clearTokenBtn');
    const tokenStatus = $('#tokenStatus');

    const toast = $('#toast');

    // ====================================================================
    // Loading
    // ====================================================================

    async function loadAll() {
        state.loading = true;
        setLoadStatus('Loading…', 'loading');

        // Local first
        const local = loadLocal();

        // Remote (best-effort)
        const remote = await loadRemote();

        // Merge by submissionId, prefer remote (canonical source)
        const merged = mergeById(remote, local);
        state.submissions = merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        applyFilters();
        updateStats();

        state.loading = false;
        if (remote.length > 0) {
            setLoadStatus(`Loaded ${remote.length} from GitHub + ${local.length} local`, 'success');
        } else if (local.length > 0) {
            setLoadStatus(`Loaded ${local.length} local submission${local.length === 1 ? '' : 's'} (no GitHub token or none found)`, '');
        } else {
            setLoadStatus('No submissions found yet', '');
        }
    }

    function loadLocal() {
        try {
            const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    async function loadRemote() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return [];

        try {
            // List directory
            const listResp = await fetch(API_BASE, {
                headers: { Authorization: `token ${token}` }
            });
            if (!listResp.ok) {
                if (listResp.status === 404) return []; // folder empty / doesn't exist
                throw new Error(`GitHub list failed: ${listResp.status}`);
            }
            const entries = await listResp.json();
            const jsonFiles = entries.filter((e) => e.name.endsWith('.json'));

            // Fetch each file
            const fetched = await Promise.all(
                jsonFiles.map(async (entry) => {
                    try {
                        const r = await fetch(entry.download_url);
                        if (!r.ok) return null;
                        return await r.json();
                    } catch {
                        return null;
                    }
                })
            );
            return fetched.filter(Boolean);
        } catch (err) {
            console.error('loadRemote failed', err);
            setLoadStatus(`GitHub fetch failed: ${err.message}`, 'error');
            return [];
        }
    }

    function mergeById(remote, local) {
        const map = new Map();
        remote.forEach((s) => s && s.submissionId && map.set(s.submissionId, s));
        local.forEach((s) => {
            if (s && s.submissionId && !map.has(s.submissionId)) {
                map.set(s.submissionId, s);
            }
        });
        return Array.from(map.values());
    }

    // ====================================================================
    // Filtering & rendering
    // ====================================================================

    function applyFilters() {
        const f = state.filters;
        state.filtered = state.submissions.filter((s) => {
            // Search
            if (f.search) {
                const haystack = JSON.stringify(s).toLowerCase();
                if (!haystack.includes(f.search.toLowerCase())) return false;
            }
            // Min
            if (f.min !== null && s.percentage < f.min) return false;
            // Max
            if (f.max !== null && s.percentage > f.max) return false;
            // Status
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
            emptyState.hidden = state.submissions.length > 0; // show "no results" only when filtering hides all
            if (state.submissions.length === 0) {
                emptyState.hidden = false;
            } else {
                emptyState.hidden = true;
            }
            return;
        }
        emptyState.hidden = true;

        state.filtered.forEach((s, idx) => {
            const card = renderSubmissionCard(s);
            card.style.animationDelay = (idx * 40) + 'ms';
            submissionsList.appendChild(card);
        });
    }

    function renderSubmissionCard(s) {
        const card = document.createElement('article');
        card.className = 'submission-card';

        const statusClass = getStatusClass(s.percentage);
        const date = formatDate(s.timestamp);
        const idDisplay = s.submissionId || '(no id)';
        const statusLabel = getStatusLabel(s.percentage);

        card.innerHTML = `
            <div class="submission-head" data-toggle>
                <div class="score-display ${statusClass}">
                    <div class="score-pct">${s.percentage}%</div>
                    <div class="score-of">${s.score}/${s.totalQuestions}</div>
                </div>
                <div class="submission-meta">
                    <div class="submission-id">${escapeHtml(idDisplay)}</div>
                    <div class="submission-date">${escapeHtml(date)}</div>
                </div>
                <span class="submission-status ${statusClass}">${statusLabel}</span>
                <button class="submission-toggle" aria-label="Expand details" type="button">
                    <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="submission-body">
                <div class="submission-body-inner">
                    <div class="section-bars">
                        <div class="section-bars-title">Section Breakdown</div>
                        ${renderSectionBars(s.sectionScores)}
                    </div>
                    <div class="answers-list">
                        <div class="answers-title">Answer-by-Answer (${(s.answers || []).length})</div>
                        ${renderAnswers(s.answers || [])}
                    </div>
                </div>
            </div>
        `;

        // Toggle expand
        card.querySelector('[data-toggle]').addEventListener('click', () => {
            card.classList.toggle('open');
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

    function renderAnswers(answers) {
        return answers.map((a) => {
            const cls = a.isCorrect ? 'correct' : 'incorrect';
            const mark = a.isCorrect ? '✓' : '✗';
            const tag = a.isCorrect ? 'CORRECT' : 'INCORRECT';
            const correctLine = !a.isCorrect
                ? `<br><span style="color:var(--ink-faint);">Correct: <span class="correct-letter">${escapeHtml(a.correct)}</span> — ${escapeHtml(a.correctText)}</span>`
                : '';
            return `
                <div class="answer-row ${cls}">
                    <div class="answer-marker">${mark}</div>
                    <div class="answer-content">
                        <p class="answer-q">${escapeHtml(a.prompt)}</p>
                        <p class="answer-detail">
                            <strong>Selected:</strong>
                            <span class="selected-letter">${escapeHtml(a.selected)}</span>
                            — ${escapeHtml(a.selectedText)}
                            ${correctLine}
                        </p>
                    </div>
                    <span class="answer-tag ${cls}">${tag}</span>
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
    // Exports
    // ====================================================================

    function exportJson() {
        const data = state.filtered.length ? state.filtered : state.submissions;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `nsutto-evaluations-${Date.now()}.json`);
        showToast(`Exported ${data.length} submission${data.length === 1 ? '' : 's'} as JSON`);
    }

    function exportCsv() {
        const data = state.filtered.length ? state.filtered : state.submissions;
        if (data.length === 0) {
            showToast('Nothing to export', 'error');
            return;
        }

        // Header
        const maxAnswers = Math.max(...data.map((s) => (s.answers || []).length));
        const headers = ['submissionId', 'timestamp', 'score', 'totalQuestions', 'percentage', 'passed'];
        for (let i = 1; i <= maxAnswers; i++) {
            headers.push(`q${i}_selected`, `q${i}_correct`, `q${i}_isCorrect`);
        }

        const rows = data.map((s) => {
            const row = [
                s.submissionId || '',
                s.timestamp || '',
                s.score ?? '',
                s.totalQuestions ?? '',
                s.percentage ?? '',
                s.passed ?? ''
            ];
            const answers = s.answers || [];
            for (let i = 0; i < maxAnswers; i++) {
                const a = answers[i];
                if (a) {
                    row.push(a.selected || '', a.correct || '', a.isCorrect ?? '');
                } else {
                    row.push('', '', '');
                }
            }
            return row;
        });

        const csv = [headers, ...rows]
            .map((r) => r.map(csvEscape).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `nsutto-evaluations-${Date.now()}.csv`);
        showToast(`Exported ${data.length} submission${data.length === 1 ? '' : 's'} as CSV`);
    }

    function csvEscape(val) {
        const s = String(val ?? '');
        if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ====================================================================
    // Token management
    // ====================================================================

    function updateTokenUI() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            tokenStatus.textContent = '✓ Token saved. Submissions will be fetched from GitHub automatically.';
            tokenStatus.classList.add('success');
            tokenStatus.classList.remove('error');
        } else {
            tokenStatus.textContent = 'No token. Only locally stored submissions are shown.';
            tokenStatus.classList.remove('success', 'error');
        }
    }

    function saveToken() {
        const token = tokenInput.value.trim();
        if (!token) {
            tokenStatus.textContent = 'Please paste a valid token.';
            tokenStatus.classList.add('error');
            return;
        }
        localStorage.setItem(TOKEN_KEY, token);
        tokenInput.value = '';
        updateTokenUI();
        showToast('GitHub token saved');
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
        updateTokenUI();
        showToast('Token cleared');
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
            const d = new Date(iso);
            return d.toLocaleString(undefined, {
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
        updateTokenUI();

        searchInput.addEventListener('input', onFilterChange);
        filterMin.addEventListener('input', onFilterChange);
        filterMax.addEventListener('input', onFilterChange);
        filterStatus.addEventListener('change', onFilterChange);

        refreshBtn.addEventListener('click', loadAll);
        exportJsonBtn.addEventListener('click', exportJson);
        exportCsvBtn.addEventListener('click', exportCsv);

        saveTokenBtn.addEventListener('click', () => {
            saveToken();
            loadAll();
        });
        clearTokenBtn.addEventListener('click', () => {
            clearToken();
            loadAll();
        });
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveToken();
                loadAll();
            }
        });

        loadAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
