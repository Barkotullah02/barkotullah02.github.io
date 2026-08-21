/* ====================================================================
   NSUTTO AI Evaluation — Single Submission Detail (single.html)
   - Reads one submission UUID from URL hash
   - Fetches that row from Supabase (with answers embedded)
   - Joins with the questions table for prompt + options + reason
   - Renders full hero + section breakdown + wrong-answer detail
   ==================================================================== */

(function () {
    'use strict';

    const PASS_THRESHOLD = 70;

    const $ = (sel) => document.querySelector(sel);

    const loadingCard = $('#loadingCard');
    const missingCard = $('#missingCard');
    const missingText = $('#missingText');
    const resultRoot = $('#resultRoot');

    const resultBadge = $('#resultBadge');
    const participantName = $('#participantName');
    const participantEmail = $('#participantEmail');
    const participantStudent = $('#participantStudent');
    const resultDate = $('#resultDate');

    const ringFill = $('#ringFill');
    const scorePercent = $('#scorePercent');
    const scoreFraction = $('#scoreFraction');

    const summaryCorrect = $('#summaryCorrect');
    const summaryWrong = $('#summaryWrong');
    const summaryStatus = $('#summaryStatus');

    const sectionList = $('#sectionList');
    const wrongList = $('#wrongList');
    const wrongHelp = $('#wrongHelp');

    const toast = $('#toast');

    let currentSubmission = null;
    const questions   = new Map(); // id -> { prompt, options, correct_option, section_id, reason }
    const sectionNames = new Map(); // section_id -> title

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

    function readHashId() {
        const raw = window.location.hash || '';
        const id = decodeURIComponent(raw.replace(/^#/, '').trim());
        return id || null;
    }

    async function loadSubmission(id) {
        const sb = getSupabase();
        if (!sb) {
            showMissing('Supabase is not configured. Edit supabase-config.js.');
            return null;
        }
        try {
            // Fetch submission + answers in one call
            const subRes = await sb
                .from('submissions')
                .select('*, answers(*)')
                .eq('id', id)
                .maybeSingle();
            if (subRes.error) throw subRes.error;
            if (!subRes.data) {
                showMissing('No submission with that id was found in Supabase.');
                return null;
            }

            // Fetch questions + sections for the prompt text (in parallel with submission)
            const [qsRes, secRes] = await Promise.all([
                sb.from('questions').select('*'),
                sb.from('sections').select('*')
            ]);
            if (qsRes.error) throw qsRes.error;
            if (secRes.error) throw secRes.error;

            (qsRes.data || []).forEach((q) => {
                questions.set(q.id, {
                    prompt:        q.prompt,
                    options:        q.options || {},
                    correct:        q.correct_option,
                    sectionId:     q.section_id,
                    reason:        q.reason || ''
                });
            });
            (secRes.data || []).forEach((s) => {
                sectionNames.set(s.id, s.title);
            });

            return normaliseSubmission(subRes.data);
        } catch (err) {
            console.error(err);
            showMissing('Failed to load: ' + (err.message || 'unknown error'));
            return null;
        }
    }

    // ====================================================================
    // Rendering
    // ====================================================================

    function statusFor(pct) {
        if (pct >= PASS_THRESHOLD) return { key: 'proficient', label: 'Proficient' };
        if (pct >= 50) return { key: 'review', label: 'Needs review' };
        return { key: 'low', label: 'Further study' };
    }

    function renderHero(s) {
        const p = s.participant || {};
        participantName.textContent = p.fullName || 'Anonymous participant';
        participantEmail.textContent = p.email || '—';
        participantStudent.textContent = p.studentId ? `Student ID: ${p.studentId}` : 'Student ID: —';
        resultDate.textContent = formatDate(s.timestamp);

        const status = statusFor(s.percentage);
        resultBadge.className = `result-badge ${status.key}`;
        resultBadge.textContent = status.label.toUpperCase();
    }

    function renderScore(s) {
        scorePercent.textContent = `${s.percentage}%`;
        scoreFraction.textContent = `${s.score} / ${s.totalQuestions} correct`;

        const status = statusFor(s.percentage);
        ringFill.classList.remove('proficient', 'review', 'low');
        ringFill.classList.add(status.key);

        const circumference = 2 * Math.PI * 86;
        const offset = circumference * (1 - s.percentage / 100);
        setTimeout(() => {
            ringFill.style.strokeDashoffset = String(offset);
        }, 80);
    }

    function renderSummary(s) {
        const wrong = s.totalQuestions - s.score;
        summaryCorrect.textContent = `${s.score} / ${s.totalQuestions}`;
        summaryWrong.textContent = String(wrong);
        summaryStatus.textContent = statusFor(s.percentage).label;
    }

    function computeSectionScores(s) {
        const bySection = {};
        s.answers.forEach((a) => {
            const q = questions.get(a.qId);
            if (!q) return;
            if (!bySection[q.sectionId]) bySection[q.sectionId] = { correct: 0, total: 0 };
            bySection[q.sectionId].total += 1;
            if (a.isCorrect) bySection[q.sectionId].correct += 1;
        });
        const out = {};
        Object.keys(bySection).forEach((sid) => {
            const r = bySection[sid];
            out[sectionNames.get(sid) || sid] = {
                correct: r.correct,
                total: r.total,
                pct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100)
            };
        });
        return out;
    }

    function renderSectionBreakdown(s) {
        sectionList.innerHTML = '';
        const entries = Object.entries(computeSectionScores(s));
        entries.forEach(([name, data]) => {
            const row = document.createElement('div');
            row.className = 'section-row';
            row.innerHTML = `
                <div class="section-row-head">
                    <span class="section-row-name">${escapeHtml(name)}</span>
                    <span class="section-row-score">${data.correct} / ${data.total} (${data.pct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" data-pct="${data.pct}"></div>
                </div>
            `;
            sectionList.appendChild(row);
        });

        requestAnimationFrame(() => {
            sectionList.querySelectorAll('.bar-fill').forEach((bar) => {
                bar.style.width = bar.dataset.pct + '%';
            });
        });
    }

    function renderWrongList(s) {
        wrongList.innerHTML = '';
        const wrongAnswers = (s.answers || []).filter((a) => !a.isCorrect);

        if (wrongAnswers.length === 0) {
            wrongHelp.hidden = true;
            const empty = document.createElement('div');
            empty.className = 'wrong-empty';
            empty.textContent = `Perfect score — answered all ${s.totalQuestions} questions correctly.`;
            wrongList.appendChild(empty);
            return;
        }

        wrongHelp.hidden = false;

        wrongAnswers.forEach((a) => {
            const q = questions.get(a.qId);
            const prompt       = q ? q.prompt : `Question ${a.qId}`;
            const correct      = q ? q.correct : '?';
            const correctText  = q ? q.options[correct] : '';
            const selectedText = q ? q.options[a.selected] : '';
            const reason       = q ? q.reason : '';

            const item = document.createElement('div');
            item.className = 'wrong-item';
            item.innerHTML = `
                <div class="wrong-num">Q${a.qId}</div>
                <div>
                    <p class="wrong-q">${escapeHtml(prompt)}</p>
                    <p class="wrong-detail">
                        <span class="selected">Their answer: ${escapeHtml(a.selected)} — ${escapeHtml(selectedText)}</span><br>
                        <span class="correct">Correct answer: ${escapeHtml(correct)} — ${escapeHtml(correctText)}</span>
                        ${reason ? `<span class="reason">${escapeHtml(reason)}</span>` : ''}
                    </p>
                </div>
            `;
            wrongList.appendChild(item);
        });
    }

    function showMissing(message) {
        loadingCard.hidden = true;
        if (message) missingText.textContent = message;
        missingCard.hidden = false;
    }

    function showResult() {
        loadingCard.hidden = true;
        resultRoot.hidden = false;
        document.getElementById('year').textContent = new Date().getFullYear();

        renderHero(currentSubmission);
        renderScore(currentSubmission);
        renderSummary(currentSubmission);
        renderSectionBreakdown(currentSubmission);
        renderWrongList(currentSubmission);
    }

    // ====================================================================
    // Helpers
    // ====================================================================

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

    // ====================================================================
    // Init
    // ====================================================================

    async function init() {
        const id = readHashId();
        if (!id) {
            missingText.textContent = 'Open this page from the All results page, or click a submission card.';
            showMissing();
            return;
        }
        const sub = await loadSubmission(id);
        if (!sub) {
            // loadSubmission already populated the missing card
            return;
        }
        currentSubmission = sub;
        showResult();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();