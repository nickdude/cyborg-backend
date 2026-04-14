# Backend Integration Design

Merge two separate backends (Backend A: Express/cyborg-backend, Backend B: Fastify/Playground/cyborg/backend) into a single Express codebase. Backend A is the base. Backend B's AI chat, report parsing, goals, and wearable systems get ported in following Backend A's coding conventions.

## Decision Log

- **Framework:** Express (Backend A). All Fastify code rewritten to Express patterns.
- **Auth:** Backend A's full OTP + social login + bcrypt. Backend B's PBKDF2 auth discarded.
- **User model:** Backend A's schema as base, add `hasSeenWelcome` and `bloodReport` (single ref to latest ReportData) from Backend B.
- **Reports:** Backend B's `ReportData` replaces Backend A's `BloodReport` + `ActionPlan`. Full vision parsing, normalization, scoring pipeline.
- **Chat:** Backend B's agentic chat system replaces Backend A's three mock AI endpoints.
- **Goals + Wearables:** Ported from Backend B. No standalone wearable HTTP endpoint — used as chat tool and inside goals engine only.
- **Payments, Notifications, Questionnaire, Referral, Email:** Backend A's — untouched.
- **Frontend folder in Playground repo:** Ignored entirely.

## Models

### Keep from Backend A (unchanged)
- `User.js` — add fields: `hasSeenWelcome` (Boolean, default false), `bloodReport` (ObjectId ref to ReportData, single latest)
- `Subscription.js`
- `Notification.js`
- `OnboardingAnswer.js`
- `Questionnaire.js`
- `ReferralSource.js`

### Add from Backend B
- `ReportData.js` — parsed reports with `biomarkerPanel`, `scores`, `normalizedTests`. Collection: `reportsdata`. Indexes: `{userId:1, reportDate:-1}`, `{userId:1, 'biomarkerPanel.canonicalName':1, reportDate:-1}`.
- `Chat.js` — `userId`, `title`, `chatType` (patient/doctor), `patientId`, `messages[]` (role, content, toolUses, thinking). Indexes: `{userId:1, updatedAt:-1}`, `{userId:1, chatType:1, updatedAt:-1}`.
- `Memory.js` — episodic memory with `embedding` (3072-dim), `category`, `tags`, `importance`, TTL via `expiresAt`. Max 200/user. Uses VECTOR_DB_URI.
- `CoreFact.js` — persistent health facts, `category`, `importance`. Max 30/user. Uses VECTOR_DB_URI.
- `ChatSummary.js` — `summary`, `keyTopics[]`, `embedding` (3072-dim), `messageCount`. Uses VECTOR_DB_URI.
- `WearableData.js` — daily metrics (steps, HR, HRV, SpO2, sleep, workouts). Unique index `{userId:1, date:1}`.
- `SchemaInfo.js` — DB introspection metadata. Collection: `schema_info`.

### Remove from Backend A
- `ActionPlan.js`
- `BloodReport.js`

### User.bloodReports update
Array references change from `BloodReport` to `ReportData`.

## Routes & Endpoints

### Keep from Backend A (unchanged)
- `POST/GET /api/auth/*` — full auth flow
- `GET/POST /api/users/:userId/onboarding`
- `POST/GET /api/users/:userId/hear-about-us`
- `POST /api/users/:userId/welcome-seen`
- `GET/PUT /api/users/:userId/profile`
- `GET /api/users` — doctor list all users
- `GET/POST /api/payments/*`
- `GET/PATCH /api/notifications/*`
- `GET/PUT /api/questionnaire`

### Add (rewritten to Express)

**Reports** (same URL prefix, replaces old blood report endpoints):
- `POST /api/users/:userId/blood-reports` — upload + vision parse + normalize + score
- `GET /api/users/:userId/blood-reports` — list all reports
- `GET /api/users/blood-reports/:reportId` — single report detail
- `PATCH /api/users/blood-reports/:reportId` — update label/date
- `DELETE /api/users/:userId/blood-reports/:reportId` — delete report
- `GET /api/users/blood-reports/biomarkers` — unique biomarker names
- `GET /api/users/blood-reports/biomarker-panel` — latest panel with stats
- `GET /api/users/blood-reports/timeline/:canonicalName` — biomarker trend

**Chat** (patient):
- `GET /api/chats` — list patient chats
- `POST /api/chats` — create chat
- `GET /api/chats/:id` — get chat detail
- `POST /api/chats/:id/messages` — send message + SSE stream response
- `PATCH /api/chats/:id` — update title
- `DELETE /api/chats/:id` — delete chat

**Doctor:**
- `GET /api/doctor/patients` — list patients
- `GET /api/doctor/patients/:patientId` — patient detail with core facts
- `GET /api/doctor/chats` — list doctor chats (optional `?patientId=` filter)
- `POST /api/doctor/chats` — create doctor chat for patient
- `GET /api/doctor/chats/:id` — get doctor chat detail
- `POST /api/doctor/chats/:id/messages` — doctor chat + SSE stream
- `PATCH /api/doctor/chats/:id` — update title
- `DELETE /api/doctor/chats/:id` — delete doctor chat

**Goals:**
- `GET /api/goals` — list goal cards
- `GET /api/goals/:goalId` — goal detail

**Agent** (server-to-server):
- `POST /api/agent/parse-report` — parse report from URL or bloodReportId

### Remove from Backend A
- `POST /api/chat` — mock chat
- `POST /api/concierge/ask` — mock concierge
- `POST /api/doctor/ask` — mock doctor
- `POST/GET /api/action-plans/*` — all action plan endpoints
- `POST /api/users/blood-reports/:reportId/generate-action-plan`
- `GET /api/users/blood-reports/:reportId/action-plan`

## Services, Utilities & Providers

### Keep from Backend A (unchanged)
- `config/db.js`, `config/multer.js` (add WEBP support)
- `utils/tokenGenerator.js`, `utils/sendEmail.js`, `utils/emailTemplates.js`, `utils/pdfGenerator.js`
- All 4 middlewares (authMiddleware, responseHandler, errorHandler, validateRequest)

### Add from Backend B (rewritten to Express)

**Provider:**
- `providers/ai.js` — Claude/Gemini abstraction (streamChat, parseVision, generateText, extractJSON)

**Services:**
- `services/embeddings.js` — Gemini embedding generation (3072-dim, key rotation)
- `services/postProcessing.js` — fire-and-forget core fact extraction + chat summary
- `services/goalsEngine.js` — 3-layer goal card generation
- `services/perplexity.js` — web search via Sonar API
- `services/wearableTrends.js` — trend computation (used by chat tool + goals engine, no HTTP endpoint)

**Utilities:**
- `utils/labNormalizer.js` — 165+ biomarker normalization
- `utils/scoringEngine.js` — Cyborg Score, BioAge, category grades
- `utils/derivedBiomarkers.js` — 30 computed biomarkers
- `utils/issueDetector.js` — health issue detection
- `utils/goalGenerator.js` — issue-to-goal template mapping
- `utils/context.js` — message context trimming
- `utils/schemaBuilder.js` — DB introspection

**Tools (all 10 for agentic chat):**
- getMedicalData, getWearableData, searchChatHistory, fetchFullChat, webSearch, searchMedicalEvidence, suggestMedication, getSchemaInfo, saveMemory, recallMemories

**Prompts:**
- `prompts/chat.js` — patient system prompt (3-block cached)
- `prompts/doctorChat.js` — doctor system prompt
- `prompts/goalNarrative.js` — goal card narratives
- `prompts/pdfParser.js` — vision model report parsing

**Data:**
- `data/goalTemplates.js` — ~20 goal templates
- `data/issueTemplates.js` — ~50 issue templates

**Config:**
- `config/vectorDb.js` — separate vector DB connection

### Remove from Backend A
- `utils/mockAI.js`, `utils/conciergeAI.js`, `utils/doctorAI.js`, `utils/bloodReportAI.js`, `utils/realAIService.js`

## Environment Variables

### Keep from Backend A
- `MONGO_URI`, `JWT_SECRET`, `PORT`
- `EMAIL_USER`, `EMAIL_PASS`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

### Add from Backend B
- `VECTOR_DB_URI` — separate MongoDB for vector collections
- `ANTHROPIC_API_KEY` — Claude API
- `AI_PROVIDER` — claude or gemini
- `CLAUDE_MODEL`, `GEMINI_MODEL` — model selection
- `ENABLE_THINKING`, `THINKING_BUDGET_TOKENS` — extended thinking
- `MAX_CONTEXT_MESSAGES` — default 30
- `PERPLEXITY_API_KEY` — web search
- `GEMINI_API_KEY_1` through `GEMINI_API_KEY_20` — embedding key rotation
- `AUTH_MODE` — dev mode toggle

### Remove from Backend A
- `REAL_AI_API_URL`, `REAL_AI_API_KEY`, `USE_REAL_AI`

## Implementation Phases

### Phase 1 — Clean Backend A
Remove: ActionPlan model/controller/routes, BloodReport model, mock AI files, chat/concierge/doctor routes+controllers. Update app.js.

### Phase 2 — Add new models
Port: ReportData, Chat, Memory, CoreFact, ChatSummary, WearableData, SchemaInfo. Update User model (add hasSeenWelcome, bloodReport single ref, update bloodReports ref to ReportData).

### Phase 3 — Add config & providers
Add: config/vectorDb.js, providers/ai.js, services/embeddings.js.

### Phase 4 — Add utilities & data
Port: labNormalizer, scoringEngine, derivedBiomarkers, issueDetector, goalGenerator, context, schemaBuilder. Copy: goalTemplates, issueTemplates. Port prompts: chat, doctorChat, goalNarrative, pdfParser.

### Phase 5 — Add tools
Port all 10 chat tools. Mostly framework-agnostic.

### Phase 6 — Add services
Port: postProcessing, goalsEngine, perplexity, wearableTrends.

### Phase 7 — Add routes & controllers
Rewrite in Express style (res.sendSuccess/sendError, verifyToken, checkRole): report routes, chat routes, doctor routes, goal routes, agent route. Update app.js to mount new routes.

### Phase 8 — Update multer config
Add WEBP support to file filter.

### Phase 9 — Verification
- Every ported route matches Backend B's original logic (request handling, DB queries, response shape)
- SSE streaming works in Express (textDelta, thinkingDelta, toolStart, toolEnd, done, error)
- All 10 chat tools execute correctly
- Report pipeline: upload → vision parse → normalize → score
- Goals pipeline: issue detection → goal generation → narrative
- Post-processing fires correctly after chat responses
- Backend A's existing features still work (auth, payments, notifications, questionnaire, referral, email)
- Vector DB connection handles Memory/CoreFact/ChatSummary
- No broken imports, missing dependencies, or dangling references

## Coding Conventions (Backend A patterns to follow)

- Routes: `express.Router()`, middleware chains like `[verifyToken, checkRole(["user"])]`
- Controllers: `async (req, res, next) => {}`, use `res.sendSuccess(data, message, status)` and `res.sendError(message, status)`
- Error handling: pass errors to `next(err)` for global error handler
- Auth: `req.user` populated by `verifyToken` middleware with `{id, email, phone, userType}`
- File uploads: multer middleware in route chain
- Response format: `{ success, statusCode, message, data, timestamp }`
