/* ====================================================================
   NSUTTO AI Evaluation — Form Logic (Supabase edition)
   - Participant intake (name / email / optional student ID)
   - Submits directly to Supabase (the canonical database)
   - Server-side uniqueness on email enforces "one attempt per person"
   - After submit: inline "Submitted successfully" — no redirects, no downloads
   ==================================================================== */

(function () {
    'use strict';

    // ----- Configuration -----
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

    // Brief reasons shown next to the correct answer in the per-submission view.
    const REASONS = {
        1: 'ChatGPT is a Generative AI tool — it produces new text, code, and answers from prompts.',
        2: 'A chatbot automates conversations and answers user queries — that is its primary purpose.',
        3: 'AI augments humans by automating routine work, freeing time for the creative parts of a role.',
        4: 'Assistant preferences customize tone, behavior, and capabilities to fit how the user works.',
        5: 'Rina wants to reduce wait times on FAQs — an AI chatbot is purpose-built for that.',
        6: 'Farhan needs intelligent, automatic calendar management to avoid scheduling conflicts.',
        7: '`max_tokens` caps how many tokens the model may produce in a single response.',
        8: 'Zero-hallucination means the model answers only from the documents you supplied — increasing accuracy and trust.',
        9: 'In AI, a "hallucination" is when the model confidently produces false or made-up information.',
        10: 'LLM stands for Large Language Model.',
        11: 'A good prompt is specific: who it is for, what to include, and the context (time, agenda, attendees).',
        12: 'Gemini Notebook only uses the documents you upload, so it does not invent answers.',
        13: 'Both Qwen and Claude were used to analyze the simple Excel datasets in the training.',
        14: 'Artificial Narrow Intelligence (ANI) performs one specific task only — like a spam filter or voice assistant.',
        15: 'Flagging unusual transactions without labels is a classic unsupervised anomaly-detection problem.',
        16: 'Failing on new slang is a sign the model overfit the training data and cannot generalize.',
        17: 'Consistently deprioritizing certain universities is almost always the result of biased training data.',
        18: 'Personalized recommendation engines power "customers who viewed X also viewed…" features.',
        19: 'Custom Skills in Claude are for recurring, multi-step workflows you want to apply consistently.',
        20: 'Gmail Trigger → AI/LLM → Google Sheets → Slack matches every step of the described workflow.'
    };

    const QUESTIONS = [
        // Section 1 — Generative AI & Chatbots (Q1-Q4)
        {
            id: 1, section: 'genai',
            prompt: 'Which of the following is an example of a Generative AI tool?',
            options: { A: 'Microsoft Excel with Power Query', B: 'Google Maps with AI recommendations', C: 'ChatGPT', D: 'Adobe Photoshop (classic non-AI version)' },
            correct: 'C'
        },
        {
            id: 2, section: 'genai',
            prompt: 'What is the primary purpose of a chatbot?',
            options: { A: 'To permanently archive all company emails', B: 'To automate conversations and answer user queries', C: 'To generate high-resolution product images', D: 'To manage physical server hardware remotely' },
            correct: 'B'
        },
        {
            id: 3, section: 'genai',
            prompt: "Which statement best describes the impact of AI on professional roles?",
            options: { A: 'AI will completely replace all human professionals within 5 years', B: 'AI only benefits tech workers and engineers', C: 'AI augments human capabilities by automating routine tasks, freeing time for creative work', D: 'AI has negligible impact on traditional business roles outside of IT' },
            correct: 'C'
        },
        {
            id: 4, section: 'genai',
            prompt: "What are 'AI Assistant Preferences' used for?",
            options: { A: "To permanently disable the AI's ability to access external knowledge", B: "To customize the AI's behavior, tone, and functionality to match user needs", C: 'To retrain the entire underlying model from scratch using private data', D: 'To automatically wipe conversation history after every session' },
            correct: 'B'
        },
        // Section 2 (Q5-Q6)
        {
            id: 5, section: 'workplace',
            prompt: "Case: Rina is a customer support manager. She wants to reduce customer wait times and handle repetitive FAQs automatically without adding more staff.\n\nWhich AI solution would BEST help Rina achieve her goal?",
            options: { A: 'A data analytics dashboard', B: 'An AI-powered chatbot', C: 'A social media scheduling tool', D: 'A word processing software' },
            correct: 'B'
        },
        {
            id: 6, section: 'workplace',
            prompt: "Case: Farhan is a busy executive with back-to-back meetings. He often misses appointments because of scheduling conflicts and wants an automated solution to manage his calendar.\n\nWhich AI capability would BEST solve Farhan's problem?",
            options: { A: 'AI-powered image generation', B: 'AI-powered intelligent scheduling tools', C: 'AI-powered video editing', D: 'Robotic process automation for invoicing' },
            correct: 'B'
        },
        // Section 3 (Q7-Q14)
        {
            id: 7, section: 'llm',
            prompt: "When using the Claude API or similar LLM APIs, what does the 'max_tokens' parameter define?",
            options: { A: 'The maximum number of source documents the model can retrieve', B: 'The maximum number of words allowed in the system prompt', C: 'The upper limit on the number of tokens the model can generate in a response', D: "The minimum required length of the user's input message before generation starts" },
            correct: 'C'
        },
        {
            id: 8, section: 'llm',
            prompt: "Why is Gemini Notebook's 'zero hallucination' feature important for serious work?",
            options: { A: 'It improves the visual formatting and styling of generated documents', B: 'It ensures the AI only gives answers based on the actual documents you provided, improving accuracy and trust', C: 'It prioritizes speed of response over depth of analysis', D: 'It automatically translates uploaded documents into multiple languages' },
            correct: 'B'
        },
        {
            id: 9, section: 'llm',
            prompt: "What does 'hallucination' mean when talking about AI?",
            options: { A: 'The AI displays colorful visual effects on screen during generation', B: 'The AI generates false or made-up information that sounds real', C: 'The AI refuses to process documents that contain images', D: 'The AI significantly slows down when handling large context windows' },
            correct: 'B'
        },
        {
            id: 10, section: 'llm',
            prompt: 'What is the full form of LLM in AI?',
            options: { A: 'Large Language Model', B: 'Linear Learning Machine', C: 'Latent Logic Module', D: 'Limited Language Method' },
            correct: 'A'
        },
        {
            id: 11, section: 'llm',
            prompt: 'Which of the following is an example of a GOOD prompt for writing a note?',
            options: { A: "'Write something interesting'", B: "'Write a formal note to my department about tomorrow's meeting at 10am including agenda items and expected attendees'", C: "'Note please, make it good'", D: "'Do the note thing for the meeting'" },
            correct: 'B'
        },
        {
            id: 12, section: 'llm',
            prompt: 'What is a key advantage of Gemini Notebook mentioned during the training?',
            options: { A: 'It can autonomously browse and scrape any website without restriction', B: 'It has zero hallucination because it only uses the documents you upload', C: 'It can fully replace all knowledge workers in government agencies', D: 'It functions completely offline with no internet connection required' },
            correct: 'B'
        },
        {
            id: 13, section: 'llm',
            prompt: 'Which AI tool was used to analyze simple structured Excel data during the training?',
            options: { A: 'Only Claude', B: 'Both Qwen and Claude', C: 'Only Grok', D: 'Only ChatGPT' },
            correct: 'B'
        },
        {
            id: 14, section: 'llm',
            prompt: 'Which type of AI is capable of performing only one specific task?',
            options: { A: 'Artificial General Intelligence (AGI)', B: 'Artificial Narrow Intelligence (ANI)', C: 'Reinforcement Learning AI', D: 'Deep Learning AI' },
            correct: 'B'
        },
        // Section 4 (Q15-Q18)
        {
            id: 15, section: 'ml',
            prompt: "Case: A bank receives thousands of transactions per minute. They want to automatically flag unusual spending patterns without labeling every transaction.\n\nWhich ML approach is most suitable?",
            options: { A: 'Supervised Learning', B: 'Unsupervised Learning', C: 'Reinforcement Learning', D: 'Rule-based System' },
            correct: 'B'
        },
        {
            id: 16, section: 'ml',
            prompt: "Case: An e-commerce company trains an AI on millions of labeled customer reviews to predict 'Positive', 'Negative', or 'Neutral' sentiment. The model later fails on new slang terms.\n\nThis failure is most likely due to:",
            options: { A: 'Overfitting to the training data and lack of exposure to new language patterns', B: 'The model was not allocated sufficient RAM during inference', C: 'Natural Language Processing techniques cannot be applied to customer reviews', D: 'The neural network architecture used an excessive number of layers' },
            correct: 'A'
        },
        {
            id: 17, section: 'ml',
            prompt: 'Case: A recruiting platform screens 5,000 resumes in minutes and ranks candidates. A hiring manager notices it consistently deprioritizes candidates from certain universities.\n\nThis issue is most likely caused by:',
            options: { A: 'A bug in the HR software user interface', B: 'Biased training data reflecting historical hiring preferences', C: 'Insufficient computational resources allocated to the model', D: 'Using an insufficient number of layers in the neural network' },
            correct: 'B'
        },
        {
            id: 18, section: 'ml',
            prompt: 'A retail store wants to suggest products to customers based on their browsing history.\n\nWhich AI feature powers this?',
            options: { A: 'Sentiment Analysis', B: 'Personalized Recommendation Engine', C: 'Speech Recognition', D: 'Fraud Detection' },
            correct: 'B'
        },
        // Section 5 (Q19-Q20)
        {
            id: 19, section: 'automation',
            prompt: 'When is it most appropriate to create and use a custom Skill in Claude?',
            options: { A: 'When you need a one-off answer to a simple factual question', B: 'When you have a recurring multi-step workflow or specialized process that should be applied consistently across conversations', C: 'When you want to train an entirely new foundational large language model from scratch', D: 'When the AI should operate completely offline without any external knowledge' },
            correct: 'B'
        },
        {
            id: 20, section: 'automation',
            prompt: "Case: A finance team wants to automate the following process:\n1. Detect new emails containing invoices in a shared Gmail inbox\n2. Extract key invoice details (vendor, amount, due date) using an AI model\n3. Append the extracted data as a new row in a Google Sheet\n4. Send a summary notification to a Slack channel\n\nWhich set of n8n nodes is BEST suited to complete this workflow?",
            options: { A: 'Schedule Trigger → HTTP Request → Notion → Discord', B: 'Gmail Trigger → AI / OpenAI (or similar LLM node) → Google Sheets → Slack', C: 'Webhook → Code → Airtable → Email Send', D: 'RSS Feed Read → Filter → Dropbox → Telegram' },
            correct: 'B'
        }
    ];

    // Expose for the per-submission page
    window.NSUTTO_QUESTIONS = QUESTIONS;
    window.NSUTTO_SECTIONS = SECTIONS;
    window.NSUTTO_REASONS = REASONS;

    // ----- State -----
    const state = {
        participant: null,
        answers: {}
    };

    // ----- Supabase client (lazy) -----
    let supabaseClient = null;
    function getSupabase() {
        if (supabaseClient) return supabaseClient;
        const cfg = window.NSUTTO_SUPABASE;
        if (!cfg || !cfg.url || cfg.url.includes('YOUR-PROJECT')) {
            return null; // not configured
        }
        if (!window.supabase || !window.supabase.createClient) {
            console.error('Supabase SDK not loaded');
            return null;
        }
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
            auth: { persistSession: false }
        });
        return supabaseClient;
    }

    // ----- DOM refs -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    const participantCard = $('#participantCard');
    const participantForm = $('#participantForm');
    const fullNameInput = $('#fullName');
    const emailInput = $('#email');
    const studentIdInput = $('#studentId');
    const startEvalBtn = $('#startEvalBtn');
    const participantStatus = $('#participantStatus');

    const lockedCard = $('#lockedCard');
    const lockedText = $('#lockedText');

    const successCard = $('#successCard');
    const successText = $('#successText');

    const form = $('#evaluationForm');
    const sectionsContainer = $('#sectionsContainer');
    const progressFill = $('#progressFill');
    const progressText = $('#progressText');
    const progressSection = $('#progressSection');
    const progressQuestion = $('#progressQuestion');
    const progressPill = $('#progressPill');
    const submitBtn = $('#submitBtn');

    const toast = $('#toast');

    // ====================================================================
    // Email uniqueness check (replaces device lock)
    // ====================================================================

    async function emailAlreadySubmitted(email) {
        const sb = getSupabase();
        if (!sb) return false; // can't check, allow through
        try {
            const { data, error } = await sb
                .from('submissions')
                .select('id')
                .eq('email', email.trim().toLowerCase())
                .limit(1);
            if (error) {
                console.error('email uniqueness check failed', error);
                return false;
            }
            return Array.isArray(data) && data.length > 0;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    // ====================================================================
    // Participant intake
    // ====================================================================

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    }

    function updateParticipantButton() {
        const ok =
            fullNameInput.value.trim().length >= 2 &&
            isValidEmail(emailInput.value);
        startEvalBtn.disabled = !ok;
        participantStatus.textContent = ok
            ? 'Ready when you are — click Start Evaluation to begin.'
            : '';
    }

    function bindParticipantEvents() {
        [fullNameInput, emailInput, studentIdInput].forEach((el) => {
            el.addEventListener('input', () => {
                participantStatus.textContent = '';
                updateParticipantButton();
            });
        });

        participantForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = fullNameInput.value.trim();
            const email = emailInput.value.trim();
            const studentId = studentIdInput.value.trim();

            if (fullName.length < 2) {
                participantStatus.textContent = 'Please enter your full name.';
                fullNameInput.focus();
                return;
            }
            if (!isValidEmail(email)) {
                participantStatus.textContent = 'Please enter a valid email address.';
                emailInput.focus();
                return;
            }

            // Check uniqueness before letting them start the form.
            startEvalBtn.disabled = true;
            participantStatus.textContent = 'Checking…';

            const exists = await emailAlreadySubmitted(email);
            if (exists) {
                lockedText.textContent = `An evaluation has already been submitted with this email address. Each email is allowed exactly one attempt.`;
                participantCard.hidden = true;
                lockedCard.hidden = false;
                return;
            }

            state.participant = { fullName, email, studentId };
            beginEvaluation();
        });
    }

    // ====================================================================
    // Render questions
    // ====================================================================

    function beginEvaluation() {
        participantCard.hidden = true;
        lockedCard.hidden = true;
        form.hidden = false;
        progressPill.hidden = false;
        renderSections();
        updateProgress();
        updateHeaderProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderSections() {
        sectionsContainer.innerHTML = '';
        SECTIONS.forEach((section, sIdx) => {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'section';
            sectionEl.dataset.sectionId = section.id;
            sectionEl.dataset.sectionIndex = String(sIdx + 1);

            const header = document.createElement('div');
            header.className = 'section-header';
            header.innerHTML = `<span class="section-tag">SECTION ${sIdx + 1} OF ${SECTIONS.length}</span>`;
            const title = document.createElement('h3');
            title.className = 'section-title';
            title.textContent = section.title;
            header.appendChild(title);

            const wrap = document.createElement('div');
            wrap.className = 'section-questions';

            QUESTIONS.filter((q) => q.section === section.id).forEach((q, qIdx) => {
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
        const firstUnanswered = QUESTIONS.find((q) => !state.answers[q.id]);
        if (!firstUnanswered) {
            progressSection.textContent = 'All sections complete';
            progressQuestion.textContent = `Ready to submit • ${QUESTIONS.length} of ${QUESTIONS.length}`;
            return;
        }
        const sectionIndex = SECTIONS.findIndex((s) => s.id === firstUnanswered.section);
        const answeredCount = Object.keys(state.answers).length;
        progressSection.textContent = `Section ${sectionIndex + 1} of ${SECTIONS.length}`;
        progressQuestion.textContent = `Question ${answeredCount + 1} of ${QUESTIONS.length}`;
    }

    // ====================================================================
    // Submit
    // ====================================================================

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
            await submitToSupabase(submission);
            showSuccess(submission);
        } catch (err) {
            console.error(err);
            const msg = err && err.message ? err.message : 'Unknown error';
            if (/duplicate|unique/i.test(msg) || (err && err.code === '23505')) {
                showToast('A submission already exists for this email.', 'error');
            } else {
                showToast('Could not submit: ' + msg, 'error');
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalSubmitHTML();
        }
    }

    function originalSubmitHTML() {
        return `Submit Evaluation <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    function showSuccess(submission) {
        form.hidden = true;
        participantCard.hidden = true;
        lockedCard.hidden = true;
        successCard.hidden = false;
        progressPill.hidden = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (submission && submission.participant && submission.participant.fullName) {
            successText.textContent = `Thank you, ${submission.participant.fullName} — your responses have been recorded. You may close this tab.`;
        }
    }

    function buildSubmission() {
        // Build the answer payload for the RPC: array of
        // { question_id, selected }. The server joins this with the
        // canonical questions table to compute correctness, score,
        // percentage, and passed — we never trust the client.
        const answers = QUESTIONS.map((q) => ({
            qId: q.id,
            selected: state.answers[q.id]
        }));

        const participant = {
            fullName: state.participant.fullName,
            email: state.participant.email.trim().toLowerCase(),
            studentId: state.participant.studentId || ''
        };
        return {
            participant,
            answers,
            userAgent: navigator.userAgent
        };
    }

    // ====================================================================
    // Supabase submission
    // ====================================================================

    async function submitToSupabase(submission) {
        const sb = getSupabase();
        if (!sb) {
            throw new Error('Supabase is not configured. Edit supabase-config.js.');
        }

        // The RPC handles uniqueness + inserts + scoring server-side in one
        // transaction. We only send the answers (no score, no selectedText
        // — the server derives everything from the canonical questions table).
        const answersPayload = submission.answers.map((a) => ({
            question_id: a.qId,
            selected:    a.selected
        }));

        const { data, error } = await sb.rpc('submit_evaluation', {
            p_full_name:  submission.participant.fullName,
            p_email:      submission.participant.email,
            p_student_id: submission.participant.studentId || '',
            p_answers:    answersPayload,
            p_user_agent: submission.userAgent || ''
        });

        if (error) throw error;
        return data; // submission UUID
    }

    // ====================================================================
    // Toast + helpers
    // ====================================================================

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

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ====================================================================
    // Init
    // ====================================================================

    function init() {
        document.getElementById('year').textContent = new Date().getFullYear();
        bindParticipantEvents();
        updateParticipantButton();
        form.addEventListener('submit', handleSubmit);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();