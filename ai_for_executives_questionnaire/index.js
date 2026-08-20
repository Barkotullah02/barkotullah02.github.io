/* ====================================================================
   NSUTTO AI Evaluation — Form Logic
   - Loads 20 questions
   - Sectioned rendering
   - Scoring + GitHub JSON persistence (mirrors contact-handler.js)
   ==================================================================== */

(function () {
    'use strict';

    // ----- Configuration -----
    const GITHUB_API_URL =
        'https://api.github.com/repos/Barkotullah02/Barkotullah02.github.io/contents/ai_for_executives_questionnaire/responses/';
    const STORAGE_KEY = 'nsutto_evaluations';
    const TOKEN_KEY = 'github_token';
    const PASS_THRESHOLD = 70; // %

    // ----- Question bank (from Final Evaluation.csv) -----
    // 5 sections, 20 questions, A/B/C/D
    const SECTIONS = [
        { id: 'genai', title: 'Generative AI & Chatbots' },
        { id: 'workplace', title: 'AI in the Workplace — Case Scenarios' },
        { id: 'llm', title: 'LLM APIs, Prompts & Tools' },
        { id: 'ml', title: 'Machine Learning Approaches' },
        { id: 'automation', title: 'Skills & Workflow Automation' }
    ];

    const QUESTIONS = [
        // Section 1 — Generative AI & Chatbots (Q1-Q4)
        {
            id: 1,
            section: 'genai',
            prompt: 'Which of the following is an example of a Generative AI tool?',
            options: {
                A: 'Microsoft Excel with Power Query',
                B: 'Google Maps with AI recommendations',
                C: 'ChatGPT',
                D: 'Adobe Photoshop (classic non-AI version)'
            },
            correct: 'C'
        },
        {
            id: 2,
            section: 'genai',
            prompt: 'What is the primary purpose of a chatbot?',
            options: {
                A: 'To permanently archive all company emails',
                B: 'To automate conversations and answer user queries',
                C: 'To generate high-resolution product images',
                D: 'To manage physical server hardware remotely'
            },
            correct: 'B'
        },
        {
            id: 3,
            section: 'genai',
            prompt: "Which statement best describes the impact of AI on professional roles?",
            options: {
                A: 'AI will completely replace all human professionals within 5 years',
                B: 'AI only benefits tech workers and engineers',
                C: 'AI augments human capabilities by automating routine tasks, freeing time for creative work',
                D: 'AI has negligible impact on traditional business roles outside of IT'
            },
            correct: 'C'
        },
        {
            id: 4,
            section: 'genai',
            prompt: "What are 'AI Assistant Preferences' used for?",
            options: {
                A: "To permanently disable the AI's ability to access external knowledge",
                B: "To customize the AI's behavior, tone, and functionality to match user needs",
                C: 'To retrain the entire underlying model from scratch using private data',
                D: 'To automatically wipe conversation history after every session'
            },
            correct: 'B'
        },

        // Section 2 — AI in the Workplace: Cases (Q5-Q6)
        {
            id: 5,
            section: 'workplace',
            prompt:
                "Case: Rina is a customer support manager. She wants to reduce customer wait times and handle repetitive FAQs automatically without adding more staff.\n\nWhich AI solution would BEST help Rina achieve her goal?",
            options: {
                A: 'A data analytics dashboard',
                B: 'An AI-powered chatbot',
                C: 'A social media scheduling tool',
                D: 'A word processing software'
            },
            correct: 'B'
        },
        {
            id: 6,
            section: 'workplace',
            prompt:
                "Case: Farhan is a busy executive with back-to-back meetings. He often misses appointments because of scheduling conflicts and wants an automated solution to manage his calendar.\n\nWhich AI capability would BEST solve Farhan's problem?",
            options: {
                A: 'AI-powered image generation',
                B: 'AI-powered intelligent scheduling tools',
                C: 'AI-powered video editing',
                D: 'Robotic process automation for invoicing'
            },
            correct: 'B'
        },

        // Section 3 — LLM APIs, Prompts & Tools (Q7-Q14)
        {
            id: 7,
            section: 'llm',
            prompt: "When using the Claude API or similar LLM APIs, what does the 'max_tokens' parameter define?",
            options: {
                A: 'The maximum number of source documents the model can retrieve',
                B: 'The maximum number of words allowed in the system prompt',
                C: 'The upper limit on the number of tokens the model can generate in a response',
                D: "The minimum required length of the user's input message before generation starts"
            },
            correct: 'C'
        },
        {
            id: 8,
            section: 'llm',
            prompt: "Why is Gemini Notebook's 'zero hallucination' feature important for serious work?",
            options: {
                A: 'It improves the visual formatting and styling of generated documents',
                B: 'It ensures the AI only gives answers based on the actual documents you provided, improving accuracy and trust',
                C: 'It prioritizes speed of response over depth of analysis',
                D: 'It automatically translates uploaded documents into multiple languages'
            },
            correct: 'B'
        },
        {
            id: 9,
            section: 'llm',
            prompt: "What does 'hallucination' mean when talking about AI?",
            options: {
                A: 'The AI displays colorful visual effects on screen during generation',
                B: 'The AI generates false or made-up information that sounds real',
                C: 'The AI refuses to process documents that contain images',
                D: 'The AI significantly slows down when handling large context windows'
            },
            correct: 'B'
        },
        {
            id: 10,
            section: 'llm',
            prompt: 'What is the full form of LLM in AI?',
            options: {
                A: 'Large Language Model',
                B: 'Linear Learning Machine',
                C: 'Latent Logic Module',
                D: 'Limited Language Method'
            },
            correct: 'A'
        },
        {
            id: 11,
            section: 'llm',
            prompt: 'Which of the following is an example of a GOOD prompt for writing a note?',
            options: {
                A: "'Write something interesting'",
                B: "'Write a formal note to my department about tomorrow's meeting at 10am including agenda items and expected attendees'",
                C: "'Note please, make it good'",
                D: "'Do the note thing for the meeting'"
            },
            correct: 'B'
        },
        {
            id: 12,
            section: 'llm',
            prompt: 'What is a key advantage of Gemini Notebook mentioned during the training?',
            options: {
                A: 'It can autonomously browse and scrape any website without restriction',
                B: 'It has zero hallucination because it only uses the documents you upload',
                C: 'It can fully replace all knowledge workers in government agencies',
                D: 'It functions completely offline with no internet connection required'
            },
            correct: 'B'
        },
        {
            id: 13,
            section: 'llm',
            prompt: 'Which AI tool was used to analyze simple structured Excel data during the training?',
            options: {
                A: 'Only Claude',
                B: 'Both Qwen and Claude',
                C: 'Only Grok',
                D: 'Only ChatGPT'
            },
            correct: 'B'
        },
        {
            id: 14,
            section: 'llm',
            prompt: 'Which type of AI is capable of performing only one specific task?',
            options: {
                A: 'Artificial General Intelligence (AGI)',
                B: 'Artificial Narrow Intelligence (ANI)',
                C: 'Reinforcement Learning AI',
                D: 'Deep Learning AI'
            },
            correct: 'B'
        },

        // Section 4 — Machine Learning Approaches (Q15-Q18)
        {
            id: 15,
            section: 'ml',
            prompt:
                "Case: A bank receives thousands of transactions per minute. They want to automatically flag unusual spending patterns without labeling every transaction.\n\nWhich ML approach is most suitable?",
            options: {
                A: 'Supervised Learning',
                B: 'Unsupervised Learning',
                C: 'Reinforcement Learning',
                D: 'Rule-based System'
            },
            correct: 'B'
        },
        {
            id: 16,
            section: 'ml',
            prompt:
                "Case: An e-commerce company trains an AI on millions of labeled customer reviews to predict 'Positive', 'Negative', or 'Neutral' sentiment. The model later fails on new slang terms.\n\nThis failure is most likely due to:",
            options: {
                A: 'Overfitting to the training data and lack of exposure to new language patterns',
                B: 'The model was not allocated sufficient RAM during inference',
                C: 'Natural Language Processing techniques cannot be applied to customer reviews',
                D: 'The neural network architecture used an excessive number of layers'
            },
            correct: 'A'
        },
        {
            id: 17,
            section: 'ml',
            prompt:
                'Case: A recruiting platform screens 5,000 resumes in minutes and ranks candidates. A hiring manager notices it consistently deprioritizes candidates from certain universities.\n\nThis issue is most likely caused by:',
            options: {
                A: 'A bug in the HR software user interface',
                B: 'Biased training data reflecting historical hiring preferences',
                C: 'Insufficient computational resources allocated to the model',
                D: 'Using an insufficient number of layers in the neural network'
            },
            correct: 'B'
        },
        {
            id: 18,
            section: 'ml',
            prompt:
                'A retail store wants to suggest products to customers based on their browsing history.\n\nWhich AI feature powers this?',
            options: {
                A: 'Sentiment Analysis',
                B: 'Personalized Recommendation Engine',
                C: 'Speech Recognition',
                D: 'Fraud Detection'
            },
            correct: 'B'
        },

        // Section 5 — Skills & Workflow Automation (Q19-Q20)
        {
            id: 19,
            section: 'automation',
            prompt: 'When is it most appropriate to create and use a custom Skill in Claude?',
            options: {
                A: 'When you need a one-off answer to a simple factual question',
                B: 'When you have a recurring multi-step workflow or specialized process that should be applied consistently across conversations',
                C: 'When you want to train an entirely new foundational large language model from scratch',
                D: 'When the AI should operate completely offline without any external knowledge'
            },
            correct: 'B'
        },
        {
            id: 20,
            section: 'automation',
            prompt:
                "Case: A finance team wants to automate the following process:\n1. Detect new emails containing invoices in a shared Gmail inbox\n2. Extract key invoice details (vendor, amount, due date) using an AI model\n3. Append the extracted data as a new row in a Google Sheet\n4. Send a summary notification to a Slack channel\n\nWhich set of n8n nodes is BEST suited to complete this workflow?",
            options: {
                A: 'Schedule Trigger → HTTP Request → Notion → Discord',
                B: 'Gmail Trigger → AI / OpenAI (or similar LLM node) → Google Sheets → Slack',
                C: 'Webhook → Code → Airtable → Email Send',
                D: 'RSS Feed Read → Filter → Dropbox → Telegram'
            },
            correct: 'B'
        }
    ];

    // ----- State -----
    const state = {
        answers: {}, // { [questionId]: 'A' | 'B' | 'C' | 'D' }
        submission: null
    };

    // ----- DOM refs -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const introCard = $('#introCard');
    const form = $('#evaluationForm');
    const sectionsContainer = $('#sectionsContainer');
    const progressFill = $('#progressFill');
    const progressText = $('#progressText');
    const progressSection = $('#progressSection');
    const progressQuestion = $('#progressQuestion');
    const submitBtn = $('#submitBtn');
    const startBtn = $('#startBtn');
    const tokenInput = $('#tokenInput');
    const saveTokenBtn = $('#saveTokenBtn');
    const clearTokenBtn = $('#clearTokenBtn');
    const tokenStatus = $('#tokenStatus');
    const resultsModal = $('#resultsModal');
    const modalClose = $('#modalClose');
    const ringFill = $('#ringFill');
    const scorePercent = $('#scorePercent');
    const scoreFraction = $('#scoreFraction');
    const sectionBreakdown = $('#sectionBreakdown');
    const resultBadge = $('#resultBadge');
    const downloadBtn = $('#downloadBtn');
    const retakeBtn = $('#retakeBtn');
    const saveStatus = $('#saveStatus');
    const toast = $('#toast');

    // ----- Render sections -----
    function renderSections() {
        sectionsContainer.innerHTML = '';

        SECTIONS.forEach((section, sIdx) => {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'section';
            sectionEl.dataset.sectionId = section.id;
            sectionEl.dataset.sectionIndex = String(sIdx + 1);

            const header = document.createElement('div');
            header.className = 'section-header';
            header.innerHTML = `
                <span class="section-tag">SECTION ${sIdx + 1} OF ${SECTIONS.length}</span>
            `;
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.textContent = section.title;
            header.appendChild(title);

            const wrap = document.createElement('div');
            wrap.className = 'section-questions';

            const sectionQuestions = QUESTIONS.filter((q) => q.section === section.id);
            sectionQuestions.forEach((q, qIdx) => {
                wrap.appendChild(renderQuestion(q, qIdx + 1));
            });

            sectionEl.appendChild(header);
            sectionEl.appendChild(wrap);
            sectionsContainer.appendChild(sectionEl);
        });
    }

    function renderQuestion(q, displayNum) {
        const wrapper = document.createElement('div');
        wrapper.className = 'question';
        wrapper.dataset.questionId = String(q.id);
        wrapper.dataset.sectionId = q.section;

        const head = document.createElement('div');
        head.className = 'question-head';
        head.innerHTML = `
            <div class="question-number">${displayNum}</div>
            <p class="question-text">${escapeHtml(q.prompt)}</p>
        `;

        const optionsEl = document.createElement('div');
        optionsEl.className = 'options';

        ['A', 'B', 'C', 'D'].forEach((letter) => {
            const opt = document.createElement('label');
            opt.className = 'option';
            opt.dataset.letter = letter;
            opt.innerHTML = `
                <input type="radio" name="q_${q.id}" value="${letter}" aria-label="Option ${letter}">
                <span class="option-letter">${letter}</span>
                <span class="option-text">${escapeHtml(q.options[letter])}</span>
            `;

            opt.addEventListener('click', (e) => {
                // Prevent double-trigger from the inner input
                e.preventDefault();
                selectOption(q.id, letter, opt);
            });

            optionsEl.appendChild(opt);
        });

        wrapper.appendChild(head);
        wrapper.appendChild(optionsEl);
        return wrapper;
    }

    function selectOption(questionId, letter, optEl) {
        // Clear siblings
        const parent = optEl.parentElement;
        $$('.option', parent).forEach((el) => el.classList.remove('selected'));
        optEl.classList.add('selected');

        const radio = optEl.querySelector('input[type="radio"]');
        radio.checked = true;

        state.answers[questionId] = letter;
        updateProgress();
        updateHeaderProgress();
    }

    // ----- Progress -----
    function updateProgress() {
        const answered = Object.keys(state.answers).length;
        const pct = (answered / QUESTIONS.length) * 100;
        progressFill.style.width = pct + '%';
        progressText.textContent = `${answered} of ${QUESTIONS.length} answered`;
        submitBtn.disabled = answered < QUESTIONS.length;
    }

    function updateHeaderProgress() {
        // Determine the current "leading" question — the first unanswered
        const firstUnanswered = QUESTIONS.find((q) => !state.answers[q.id]);
        if (!firstUnanswered) {
            progressSection.textContent = 'All sections complete';
            progressQuestion.textContent = `Ready to submit • ${QUESTIONS.length} of ${QUESTIONS.length}`;
            return;
        }

        const sectionIndex = SECTIONS.findIndex((s) => s.id === firstUnanswered.section);
        const qIndexInSection = QUESTIONS.filter((q) => q.section === firstUnanswered.section).findIndex(
            (q) => q.id === firstUnanswered.id
        );
        const answeredCount = Object.keys(state.answers).length;

        progressSection.textContent = `Section ${sectionIndex + 1} of ${SECTIONS.length}`;
        progressQuestion.textContent = `Question ${answeredCount + 1} of ${QUESTIONS.length}`;
    }

    // ----- Submit & scoring -----
    async function handleSubmit(e) {
        e.preventDefault();
        if (Object.keys(state.answers).length < QUESTIONS.length) {
            showToast('Please answer all questions before submitting.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Submitting…';

        try {
            const submission = buildSubmission();
            state.submission = submission;

            // Save to localStorage (always)
            saveLocally(submission);

            // Try GitHub
            const ghResult = await saveToGitHub(submission);

            // Show results modal
            renderResults(submission, ghResult);
        } catch (err) {
            console.error(err);
            showToast('Something went wrong: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit Evaluation <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
    }

    function buildSubmission() {
        const answers = QUESTIONS.map((q) => ({
            qId: q.id,
            section: q.section,
            prompt: q.prompt,
            selected: state.answers[q.id],
            correct: q.correct,
            isCorrect: state.answers[q.id] === q.correct,
            selectedText: q.options[state.answers[q.id]],
            correctText: q.options[q.correct]
        }));

        const correctCount = answers.filter((a) => a.isCorrect).length;
        const totalQuestions = QUESTIONS.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);

        // Section scores
        const sectionScores = {};
        SECTIONS.forEach((s) => {
            const inSection = answers.filter((a) => a.section === s.id);
            const correctInSection = inSection.filter((a) => a.isCorrect).length;
            sectionScores[s.title] = {
                correct: correctInSection,
                total: inSection.length,
                pct: inSection.length === 0 ? 0 : Math.round((correctInSection / inSection.length) * 100)
            };
        });

        const submissionId = `eval-${Date.now()}`;
        return {
            submissionId,
            timestamp: new Date().toISOString(),
            score: correctCount,
            totalQuestions,
            percentage,
            passThreshold: PASS_THRESHOLD,
            passed: percentage >= PASS_THRESHOLD,
            sectionScores,
            answers,
            userAgent: navigator.userAgent,
            source: 'NSUTTO AI for Executives — Final Evaluation'
        };
    }

    // ----- Local storage -----
    function saveLocally(submission) {
        try {
            const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            list.push(submission);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (err) {
            console.error('localStorage save failed', err);
        }
    }

    // ----- GitHub storage (mirror of contact-handler.js) -----
    async function saveToGitHub(submission) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            return { success: false, message: 'No GitHub token configured. Saved locally only.' };
        }

        try {
            const filename = `${submission.submissionId}.json`;
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(submission, null, 2))));

            const response = await fetch(`${GITHUB_API_URL}${filename}`, {
                method: 'PUT',
                headers: {
                    Authorization: `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Add NSUTTO evaluation submission ${submission.submissionId}`,
                    content,
                    branch: 'main'
                })
            });

            if (response.ok) {
                return { success: true, message: 'Saved to GitHub repository as JSON.' };
            } else {
                const err = await response.json().catch(() => ({ message: 'Unknown error' }));
                console.error('GitHub API error', err);
                return { success: false, message: `GitHub error: ${err.message || response.status}` };
            }
        } catch (err) {
            console.error('saveToGitHub failed', err);
            return { success: false, message: `Network error: ${err.message}` };
        }
    }

    // ----- Results modal -----
    function renderResults(submission, ghResult) {
        // Badge
        resultBadge.className = 'result-badge';
        if (submission.percentage >= PASS_THRESHOLD) {
            resultBadge.classList.add('proficient');
            resultBadge.textContent = 'PROFICIENT';
        } else if (submission.percentage >= 50) {
            resultBadge.classList.add('review');
            resultBadge.textContent = 'NEEDS REVIEW';
        } else {
            resultBadge.classList.add('low');
            resultBadge.textContent = 'FURTHER STUDY';
        }

        // Score
        scorePercent.textContent = `${submission.percentage}%`;
        scoreFraction.textContent = `${submission.score} / ${submission.totalQuestions} correct`;

        // Ring
        const ringClass = submission.percentage >= PASS_THRESHOLD ? 'proficient' :
                          submission.percentage >= 50 ? 'review' : 'low';
        ringFill.classList.remove('proficient', 'review', 'low');
        ringFill.classList.add(ringClass);
        const circumference = 2 * Math.PI * 86; // ≈ 540.35
        const offset = circumference * (1 - submission.percentage / 100);
        // Delay to allow CSS transition after display
        setTimeout(() => {
            ringFill.style.strokeDashoffset = String(offset);
        }, 80);

        // Section breakdown
        sectionBreakdown.innerHTML = '';
        Object.entries(submission.sectionScores).forEach(([name, data]) => {
            const row = document.createElement('div');
            row.className = 'section-row';
            row.innerHTML = `
                <div class="section-row-head">
                    <span class="section-row-name">${escapeHtml(name)}</span>
                    <span class="section-row-score">${data.correct} / ${data.total} (${data.pct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: 0%"></div>
                </div>
            `;
            sectionBreakdown.appendChild(row);
        });

        // Animate bars
        requestAnimationFrame(() => {
            $$('.bar-fill', sectionBreakdown).forEach((bar, idx) => {
                const data = Object.values(submission.sectionScores)[idx];
                setTimeout(() => {
                    bar.style.width = data.pct + '%';
                }, idx * 100);
            });
        });

        // Save status
        saveStatus.classList.remove('success', 'error');
        if (ghResult.success) {
            saveStatus.classList.add('success');
            saveStatus.textContent = '✓ ' + ghResult.message;
        } else {
            saveStatus.classList.add('error');
            saveStatus.textContent = '⚠ ' + ghResult.message + ' Local copy was saved in this browser.';
        }

        resultsModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        resultsModal.hidden = true;
        document.body.style.overflow = '';
    }

    function downloadSubmission() {
        if (!state.submission) return;
        const blob = new Blob([JSON.stringify(state.submission, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.submission.submissionId}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function resetForm() {
        state.answers = {};
        state.submission = null;
        $$('.option.selected').forEach((el) => el.classList.remove('selected'));
        $$('input[type="radio"]').forEach((el) => (el.checked = false));
        updateProgress();
        updateHeaderProgress();
        closeModal();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ----- Token settings -----
    function updateTokenUI() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            tokenStatus.textContent = '✓ Token saved. Responses will be pushed to GitHub automatically.';
            tokenStatus.classList.add('success');
            tokenStatus.classList.remove('error');
        } else {
            tokenStatus.textContent = 'No token configured. Responses will only be saved in this browser.';
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

    // ----- Toast -----
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

    // ----- Helpers -----
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ----- Wire-up -----
    function init() {
        document.getElementById('year').textContent = new Date().getFullYear();
        renderSections();
        updateProgress();
        updateHeaderProgress();

        startBtn.addEventListener('click', () => {
            introCard.style.display = 'none';
            form.hidden = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        form.addEventListener('submit', handleSubmit);
        modalClose.addEventListener('click', closeModal);
        downloadBtn.addEventListener('click', downloadSubmission);
        retakeBtn.addEventListener('click', resetForm);

        resultsModal.addEventListener('click', (e) => {
            if (e.target === resultsModal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !resultsModal.hidden) closeModal();
        });

        saveTokenBtn.addEventListener('click', saveToken);
        clearTokenBtn.addEventListener('click', clearToken);
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveToken();
            }
        });
        updateTokenUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
