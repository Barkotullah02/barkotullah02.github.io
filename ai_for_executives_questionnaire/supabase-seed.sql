-- =====================================================================
-- NSUTTO AI Evaluation — Seed data
--
-- Run after supabase-schema.sql. Populates sections + questions from
-- Final Evaluation.csv. The form (index.js) keeps its own copy of the
-- 20 questions for fast local rendering; this table is the canonical
-- source for cross-submission SQL queries and dashboard rendering.
-- =====================================================================

-- Idempotent — wipe + refill so re-running is safe.
truncate table public.questions restart identity cascade;
truncate table public.sections  restart identity cascade;

-- =====================================================================
-- Sections (5)
-- =====================================================================
insert into public.sections (id, title, sort_order) values
    ('genai',      'Generative AI & Chatbots',                          1),
    ('workplace',  'AI in the Workplace — Case Scenarios',              2),
    ('llm',        'LLM APIs, Prompts & Tools',                         3),
    ('ml',         'Machine Learning Approaches',                       4),
    ('automation', 'Skills & Workflow Automation',                      5);

-- =====================================================================
-- Questions (20)
-- =====================================================================
insert into public.questions (id, section_id, prompt, options, correct_option, reason) values
(1, 'genai',
 'Which of the following is an example of a Generative AI tool?',
 '{"A": "Microsoft Excel with Power Query", "B": "Google Maps with AI recommendations", "C": "ChatGPT", "D": "Adobe Photoshop (classic non-AI version)"}'::jsonb,
 'C',
 'ChatGPT is a Generative AI tool — it produces new text, code, and answers from prompts.'),

(2, 'genai',
 'What is the primary purpose of a chatbot?',
 '{"A": "To permanently archive all company emails", "B": "To automate conversations and answer user queries", "C": "To generate high-resolution product images", "D": "To manage physical server hardware remotely"}'::jsonb,
 'B',
 'A chatbot automates conversations and answers user queries — that is its primary purpose.'),

(3, 'genai',
 'Which statement best describes the impact of AI on professional roles?',
 '{"A": "AI will completely replace all human professionals within 5 years", "B": "AI only benefits tech workers and engineers", "C": "AI augments human capabilities by automating routine tasks, freeing time for creative work", "D": "AI has negligible impact on traditional business roles outside of IT"}'::jsonb,
 'C',
 'AI augments humans by automating routine work, freeing time for the creative parts of a role.'),

(4, 'genai',
 'What are ''AI Assistant Preferences'' used for?',
 '{"A": "To permanently disable the AI''s ability to access external knowledge", "B": "To customize the AI''s behavior, tone, and functionality to match user needs", "C": "To retrain the entire underlying model from scratch using private data", "D": "To automatically wipe conversation history after every session"}'::jsonb,
 'B',
 'Assistant preferences customize tone, behavior, and capabilities to fit how the user works.'),

(5, 'workplace',
 'Case: Rina is a customer support manager. She wants to reduce customer wait times and handle repetitive FAQs automatically without adding more staff.

Which AI solution would BEST help Rina achieve her goal?',
 '{"A": "A data analytics dashboard", "B": "An AI-powered chatbot", "C": "A social media scheduling tool", "D": "A word processing software"}'::jsonb,
 'B',
 'Rina wants to reduce wait times on FAQs — an AI chatbot is purpose-built for that.'),

(6, 'workplace',
 'Case: Farhan is a busy executive with back-to-back meetings. He often misses appointments because of scheduling conflicts and wants an automated solution to manage his calendar.

Which AI capability would BEST solve Farhan''s problem?',
 '{"A": "AI-powered image generation", "B": "AI-powered intelligent scheduling tools", "C": "AI-powered video editing", "D": "Robotic process automation for invoicing"}'::jsonb,
 'B',
 'Farhan needs intelligent, automatic calendar management to avoid scheduling conflicts.'),

(7, 'llm',
 'When using the Claude API or similar LLM APIs, what does the ''max_tokens'' parameter define?',
 '{"A": "The maximum number of source documents the model can retrieve", "B": "The maximum number of words allowed in the system prompt", "C": "The upper limit on the number of tokens the model can generate in a response", "D": "The minimum required length of the user''s input message before generation starts"}'::jsonb,
 'C',
 '`max_tokens` caps how many tokens the model may produce in a single response.'),

(8, 'llm',
 'Why is Gemini Notebook''s ''zero hallucination'' feature important for serious work?',
 '{"A": "It improves the visual formatting and styling of generated documents", "B": "It ensures the AI only gives answers based on the actual documents you provided, improving accuracy and trust", "C": "It prioritizes speed of response over depth of analysis", "D": "It automatically translates uploaded documents into multiple languages"}'::jsonb,
 'B',
 'Zero-hallucination means the model answers only from the documents you supplied — increasing accuracy and trust.'),

(9, 'llm',
 'What does ''hallucination'' mean when talking about AI?',
 '{"A": "The AI displays colorful visual effects on screen during generation", "B": "The AI generates false or made-up information that sounds real", "C": "The AI refuses to process documents that contain images", "D": "The AI significantly slows down when handling large context windows"}'::jsonb,
 'B',
 'In AI, a "hallucination" is when the model confidently produces false or made-up information.'),

(10, 'llm',
 'What is the full form of LLM in AI?',
 '{"A": "Large Language Model", "B": "Linear Learning Machine", "C": "Latent Logic Module", "D": "Limited Language Method"}'::jsonb,
 'A',
 'LLM stands for Large Language Model.'),

(11, 'llm',
 'Which of the following is an example of a GOOD prompt for writing a note?',
 '{"A": "''Write something interesting''", "B": "''Write a formal note to my department about tomorrow''s meeting at 10am including agenda items and expected attendees''", "C": "''Note please, make it good''", "D": "''Do the note thing for the meeting''"}'::jsonb,
 'B',
 'A good prompt is specific: who it is for, what to include, and the context (time, agenda, attendees).'),

(12, 'llm',
 'What is a key advantage of Gemini Notebook mentioned during the training?',
 '{"A": "It can autonomously browse and scrape any website without restriction", "B": "It has zero hallucination because it only uses the documents you upload", "C": "It can fully replace all knowledge workers in government agencies", "D": "It functions completely offline with no internet connection required"}'::jsonb,
 'B',
 'Gemini Notebook only uses the documents you upload, so it does not invent answers.'),

(13, 'llm',
 'Which AI tool was used to analyze simple structured Excel data during the training?',
 '{"A": "Only Claude", "B": "Both Qwen and Claude", "C": "Only Grok", "D": "Only ChatGPT"}'::jsonb,
 'B',
 'Both Qwen and Claude were used to analyze the simple Excel datasets in the training.'),

(14, 'llm',
 'Which type of AI is capable of performing only one specific task?',
 '{"A": "Artificial General Intelligence (AGI)", "B": "Artificial Narrow Intelligence (ANI)", "C": "Reinforcement Learning AI", "D": "Deep Learning AI"}'::jsonb,
 'B',
 'Artificial Narrow Intelligence (ANI) performs one specific task only — like a spam filter or voice assistant.'),

(15, 'ml',
 'Case: A bank receives thousands of transactions per minute. They want to automatically flag unusual spending patterns without labeling every transaction.

Which ML approach is most suitable?',
 '{"A": "Supervised Learning", "B": "Unsupervised Learning", "C": "Reinforcement Learning", "D": "Rule-based System"}'::jsonb,
 'B',
 'Flagging unusual transactions without labels is a classic unsupervised anomaly-detection problem.'),

(16, 'ml',
 'Case: An e-commerce company trains an AI on millions of labeled customer reviews to predict ''Positive'', ''Negative'', or ''Neutral'' sentiment. The model later fails on new slang terms.

This failure is most likely due to:',
 '{"A": "Overfitting to the training data and lack of exposure to new language patterns", "B": "The model was not allocated sufficient RAM during inference", "C": "Natural Language Processing techniques cannot be applied to customer reviews", "D": "The neural network architecture used an excessive number of layers"}'::jsonb,
 'A',
 'Failing on new slang is a sign the model overfit the training data and cannot generalize.'),

(17, 'ml',
 'Case: A recruiting platform screens 5,000 resumes in minutes and ranks candidates. A hiring manager notices it consistently deprioritizes candidates from certain universities.

This issue is most likely caused by:',
 '{"A": "A bug in the HR software user interface", "B": "Biased training data reflecting historical hiring preferences", "C": "Insufficient computational resources allocated to the model", "D": "Using an insufficient number of layers in the neural network"}'::jsonb,
 'B',
 'Consistently deprioritizing certain universities is almost always the result of biased training data.'),

(18, 'ml',
 'A retail store wants to suggest products to customers based on their browsing history.

Which AI feature powers this?',
 '{"A": "Sentiment Analysis", "B": "Personalized Recommendation Engine", "C": "Speech Recognition", "D": "Fraud Detection"}'::jsonb,
 'B',
 'Personalized recommendation engines power "customers who viewed X also viewed…" features.'),

(19, 'automation',
 'When is it most appropriate to create and use a custom Skill in Claude?',
 '{"A": "When you need a one-off answer to a simple factual question", "B": "When you have a recurring multi-step workflow or specialized process that should be applied consistently across conversations", "C": "When you want to train an entirely new foundational large language model from scratch", "D": "When the AI should operate completely offline without any external knowledge"}'::jsonb,
 'B',
 'Custom Skills in Claude are for recurring, multi-step workflows you want to apply consistently.'),

(20, 'automation',
 'Case: A finance team wants to automate the following process:
1. Detect new emails containing invoices in a shared Gmail inbox
2. Extract key invoice details (vendor, amount, due date) using an AI model
3. Append the extracted data as a new row in a Google Sheet
4. Send a summary notification to a Slack channel

Which set of n8n nodes is BEST suited to complete this workflow?',
 '{"A": "Schedule Trigger → HTTP Request → Notion → Discord", "B": "Gmail Trigger → AI / OpenAI (or similar LLM node) → Google Sheets → Slack", "C": "Webhook → Code → Airtable → Email Send", "D": "RSS Feed Read → Filter → Dropbox → Telegram"}'::jsonb,
 'B',
 'Gmail Trigger → AI/LLM → Google Sheets → Slack matches every step of the described workflow.');

-- =====================================================================
-- Sanity check (uncommentable by the user if curious)
-- =====================================================================
-- select id, section_id, correct_option from public.questions order by id;
-- select id, title from public.sections order by sort_order;