# Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Backend B (Fastify, Playground/cyborg/backend) features into Backend A (Express, cyborg-backend) — producing one unified Express backend with AI chat, report parsing, goals, and wearables.

**Architecture:** Backend A stays as the base (Express + CommonJS). All Backend B code gets converted from ESM to CommonJS and rewritten to use Express patterns (req/res/next, res.sendSuccess/sendError, verifyToken/checkRole middleware). Backend B source lives at `/home/kerito/Desktop/Playground/cyborg/backend/src/` — read from there, write converted code into this repo.

**Tech Stack:** Express.js 5, MongoDB/Mongoose 9, @anthropic-ai/sdk, @google/generative-ai, Perplexity Sonar API, pdf-parse

**Module System:** Backend A uses CommonJS (require/module.exports). ALL ported code from Backend B must be converted from ESM (import/export) to CommonJS.

**Source Reference:** Backend B source at `/home/kerito/Desktop/Playground/cyborg/backend/src/` (read-only, do not modify).

---

## File Structure

### Files to Delete
- `src/models/ActionPlan.js`
- `src/models/BloodReport.js`
- `src/controllers/actionPlanController.js`
- `src/controllers/chatController.js`
- `src/controllers/conciergeController.js`
- `src/controllers/doctorController.js`
- `src/routes/actionPlanRoutes.js`
- `src/routes/chatRoutes.js`
- `src/routes/conciergeRoutes.js`
- `src/routes/doctorRoutes.js`
- `src/utils/mockAI.js`
- `src/utils/conciergeAI.js`
- `src/utils/doctorAI.js`
- `src/utils/bloodReportAI.js`
- `src/utils/realAIService.js`

### Files to Create (ported from Backend B, converted to CommonJS)
- `src/models/ReportData.js`
- `src/models/Chat.js`
- `src/models/Memory.js`
- `src/models/CoreFact.js`
- `src/models/ChatSummary.js`
- `src/models/WearableData.js`
- `src/models/SchemaInfo.js`
- `src/config/vectorDb.js`
- `src/providers/ai.js`
- `src/services/embeddings.js`
- `src/services/postProcessing.js`
- `src/services/goalsEngine.js`
- `src/services/perplexity.js`
- `src/services/wearableTrends.js`
- `src/utils/labNormalizer.js`
- `src/utils/scoringEngine.js`
- `src/utils/derivedBiomarkers.js`
- `src/utils/issueDetector.js`
- `src/utils/goalGenerator.js`
- `src/utils/context.js`
- `src/utils/schemaBuilder.js`
- `src/tools/getMedicalData.js`
- `src/tools/getWearableData.js`
- `src/tools/searchChatHistory.js`
- `src/tools/fetchFullChat.js`
- `src/tools/webSearch.js`
- `src/tools/searchMedicalEvidence.js`
- `src/tools/suggestMedication.js`
- `src/tools/getSchemaInfo.js`
- `src/tools/episodicMemory.js`
- `src/prompts/chat.js`
- `src/prompts/doctorChat.js`
- `src/prompts/goalNarrative.js`
- `src/prompts/pdfParser.js`
- `src/data/goalTemplates.js`
- `src/data/issueTemplates.js`
- `src/controllers/chatController.js` (new — replaces old mock version)
- `src/controllers/doctorController.js` (new — replaces old mock version)
- `src/controllers/reportController.js`
- `src/controllers/goalController.js`
- `src/controllers/agentController.js`
- `src/routes/chatRoutes.js` (new — replaces old mock version)
- `src/routes/doctorRoutes.js` (new — replaces old mock version)
- `src/routes/goalRoutes.js`
- `src/routes/agentRoutes.js`

### Files to Modify
- `src/models/User.js` — add `bloodReport` single ref, update `bloodReports` ref from BloodReport to ReportData, add `onboardingData`
- `src/controllers/userController.js` — remove action plan functions, update blood report functions to use ReportData + vision parsing
- `src/routes/userRoutes.js` — remove action plan routes, add new report endpoints (biomarkers, biomarker-panel, timeline, patch)
- `src/config/multer.js` — add WEBP support
- `src/app.js` — remove old route mounts, add new route mounts
- `src/server.js` — add vector DB connection + schema builder init
- `package.json` — add new dependencies

---

## Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Backend B dependencies**

```bash
cd /home/kerito/Desktop/temp/cyborg-backend
npm install @anthropic-ai/sdk @google/generative-ai pdf-parse
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add AI SDK, Gemini, and pdf-parse dependencies for Backend B integration"
```

---

## Task 2: Delete obsolete files from Backend A

**Files:**
- Delete: `src/models/ActionPlan.js`, `src/models/BloodReport.js`
- Delete: `src/controllers/actionPlanController.js`, `src/controllers/chatController.js`, `src/controllers/conciergeController.js`, `src/controllers/doctorController.js`
- Delete: `src/routes/actionPlanRoutes.js`, `src/routes/chatRoutes.js`, `src/routes/conciergeRoutes.js`, `src/routes/doctorRoutes.js`
- Delete: `src/utils/mockAI.js`, `src/utils/conciergeAI.js`, `src/utils/doctorAI.js`, `src/utils/bloodReportAI.js`, `src/utils/realAIService.js`

- [ ] **Step 1: Delete all obsolete files**

```bash
cd /home/kerito/Desktop/temp/cyborg-backend
rm src/models/ActionPlan.js src/models/BloodReport.js
rm src/controllers/actionPlanController.js src/controllers/chatController.js src/controllers/conciergeController.js src/controllers/doctorController.js
rm src/routes/actionPlanRoutes.js src/routes/chatRoutes.js src/routes/conciergeRoutes.js src/routes/doctorRoutes.js
rm src/utils/mockAI.js src/utils/conciergeAI.js src/utils/doctorAI.js src/utils/bloodReportAI.js src/utils/realAIService.js
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete models, controllers, routes, and mock AI utilities"
```

---

## Task 3: Port models from Backend B

Port all 7 new models + update User model. Convert ESM to CommonJS. Read each source file from `/home/kerito/Desktop/Playground/cyborg/backend/src/models/` and write the CommonJS equivalent.

**Files:**
- Create: `src/models/ReportData.js` — port from Backend B `src/models/ReportData.js`
- Create: `src/models/Chat.js` — port from Backend B `src/models/Chat.js`
- Create: `src/models/Memory.js` — port from Backend B `src/models/Memory.js`
- Create: `src/models/CoreFact.js` — port from Backend B `src/models/CoreFact.js`
- Create: `src/models/ChatSummary.js` — port from Backend B `src/models/ChatSummary.js`
- Create: `src/models/WearableData.js` — port from Backend B `src/models/WearableData.js`
- Create: `src/models/SchemaInfo.js` — port from Backend B `src/models/SchemaInfo.js`
- Modify: `src/models/User.js`

- [ ] **Step 1: Read all 7 Backend B model files and User.js**

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/models/`: ReportData.js, Chat.js, Memory.js, CoreFact.js, ChatSummary.js, WearableData.js, SchemaInfo.js, User.js

- [ ] **Step 2: Create all 7 new model files**

For each model, convert:
- `import mongoose from 'mongoose'` → `const mongoose = require("mongoose")`
- `import { getVectorDb } from '../config/vectorDb.js'` → `const { getVectorDb } = require("../config/vectorDb")`
- `export const X = ...` → `module.exports = X` (or `module.exports = { X }`)

Memory, CoreFact, ChatSummary use the lazy Proxy pattern with `getVectorDb()` — preserve this pattern exactly.

- [ ] **Step 3: Update User.js**

In `src/models/User.js`:
1. Remove the duplicate `firstName`/`lastName` fields at lines 128-135 (keep lines 7-14)
2. Change `bloodReports` ref from `"BloodReport"` to `"ReportData"` (line 121)
3. Add `bloodReport` single ref field (latest report):
   ```javascript
   bloodReport: {
     type: mongoose.Schema.Types.ObjectId,
     ref: "ReportData",
     default: null,
   },
   ```
4. Add `onboardingData` field:
   ```javascript
   onboardingData: {
     type: mongoose.Schema.Types.Mixed,
     default: {},
   },
   ```

- [ ] **Step 4: Commit**

```bash
git add src/models/
git commit -m "feat: add ReportData, Chat, Memory, CoreFact, ChatSummary, WearableData, SchemaInfo models and update User model"
```

---

## Task 4: Port config and AI provider

**Files:**
- Create: `src/config/vectorDb.js` — port from Backend B `src/config/vectorDb.js`
- Create: `src/providers/ai.js` — port from Backend B `src/providers/ai.js`

- [ ] **Step 1: Read Backend B source files**

Read `/home/kerito/Desktop/Playground/cyborg/backend/src/config/vectorDb.js` and `/home/kerito/Desktop/Playground/cyborg/backend/src/providers/ai.js`

- [ ] **Step 2: Create vectorDb.js**

Convert to CommonJS. This is a small file — lazy singleton connection to VECTOR_DB_URI using `mongoose.createConnection()`.

- [ ] **Step 3: Create providers/ai.js**

Convert to CommonJS. This is a large file (~540 lines). Key conversions:
- `import Anthropic from '@anthropic-ai/sdk'` → `const Anthropic = require("@anthropic-ai/sdk")`
- `import { GoogleGenerativeAI } from '@google/generative-ai'` → `const { GoogleGenerativeAI } = require("@google/generative-ai")`
- All `export function` → add to `module.exports` at bottom
- Preserve all logic exactly: streamChat agentic loop, parseVision, generateText, extractJSON, convertToolsForGemini, Gemini key rotation, overload retry

Create directory first: `mkdir -p src/providers`

- [ ] **Step 4: Commit**

```bash
git add src/config/vectorDb.js src/providers/
git commit -m "feat: add vector DB config and AI provider abstraction (Claude/Gemini)"
```

---

## Task 5: Port utilities and data files

These are mostly framework-agnostic (pure logic, no HTTP). Convert ESM to CommonJS.

**Files:**
- Create: `src/utils/labNormalizer.js` — port from Backend B (large file, 165+ biomarkers)
- Create: `src/utils/scoringEngine.js` — port from Backend B
- Create: `src/utils/derivedBiomarkers.js` — port from Backend B
- Create: `src/utils/issueDetector.js` — port from Backend B
- Create: `src/utils/goalGenerator.js` — port from Backend B
- Create: `src/utils/context.js` — port from Backend B
- Create: `src/utils/schemaBuilder.js` — port from Backend B
- Create: `src/data/goalTemplates.js` — port from Backend B
- Create: `src/data/issueTemplates.js` — port from Backend B

- [ ] **Step 1: Read all Backend B utility and data files**

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/utils/`: labNormalizer.js, scoringEngine.js, derivedBiomarkers.js, issueDetector.js, goalGenerator.js, context.js, schemaBuilder.js

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/data/`: goalTemplates.js, issueTemplates.js

- [ ] **Step 2: Create all utility files**

Convert each file:
- `import X from 'Y'` → `const X = require("Y")`
- `export function X` / `export const X` → collect into `module.exports = { ... }` at bottom
- `export default X` → `module.exports = X`

Key notes:
- `labNormalizer.js` exports `normalizeTests()` and `CANONICAL_MAP`
- `scoringEngine.js` exports `computeScores()` and `checkCriticalFlags()`
- `derivedBiomarkers.js` exports `computeDerivedBiomarkers()` and `buildFullBiomarkerPanel()`
- `issueDetector.js` exports `detectIssues()`
- `goalGenerator.js` exports `generateGoals()`
- `context.js` exports `buildContextMessages()`
- `schemaBuilder.js` exports `buildDatabaseSchema()` and `getDatabaseSchema()` — update model imports to use CommonJS paths

Create directory first: `mkdir -p src/data`

- [ ] **Step 3: Create data files**

goalTemplates.js and issueTemplates.js — convert `export const` → `module.exports =`

- [ ] **Step 4: Commit**

```bash
git add src/utils/labNormalizer.js src/utils/scoringEngine.js src/utils/derivedBiomarkers.js src/utils/issueDetector.js src/utils/goalGenerator.js src/utils/context.js src/utils/schemaBuilder.js src/data/
git commit -m "feat: add biomarker normalizer, scoring engine, issue detector, goal generator, and data templates"
```

---

## Task 6: Port services

**Files:**
- Create: `src/services/embeddings.js` — port from Backend B
- Create: `src/services/postProcessing.js` — port from Backend B
- Create: `src/services/goalsEngine.js` — port from Backend B
- Create: `src/services/perplexity.js` — port from Backend B
- Create: `src/services/wearableTrends.js` — port from Backend B

- [ ] **Step 1: Read all Backend B service files**

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/services/`: embeddings.js, postProcessing.js, goalsEngine.js, perplexity.js, wearableTrends.js

- [ ] **Step 2: Create all service files**

Convert ESM to CommonJS. Update internal imports:
- Model imports: `const { Memory } = require("../models/Memory")` etc.
- Provider imports: `const { streamChat, generateText, extractJSON } = require("../providers/ai")`
- Service cross-imports: `const { generateEmbedding } = require("./embeddings")`
- Utility imports: `const { detectIssues } = require("../utils/issueDetector")` etc.

Key notes:
- `embeddings.js` — uses `@google/generative-ai` for Gemini embedding generation
- `postProcessing.js` — fire-and-forget, imports CoreFact, ChatSummary, Memory, embeddings, ai provider
- `goalsEngine.js` — imports ReportData, WearableData, User models + issueDetector, goalGenerator, goalNarrative prompt
- `perplexity.js` — standalone HTTP client using axios (already in Backend A deps)
- `wearableTrends.js` — pure computation, no imports needed

Create directory first: `mkdir -p src/services`

- [ ] **Step 3: Commit**

```bash
git add src/services/
git commit -m "feat: add embeddings, post-processing, goals engine, perplexity, and wearable trends services"
```

---

## Task 7: Port prompts

**Files:**
- Create: `src/prompts/chat.js` — port from Backend B
- Create: `src/prompts/doctorChat.js` — port from Backend B
- Create: `src/prompts/goalNarrative.js` — port from Backend B
- Create: `src/prompts/pdfParser.js` — port from Backend B

- [ ] **Step 1: Read all Backend B prompt files**

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/prompts/`: chat.js, doctorChat.js, goalNarrative.js, pdfParser.js

- [ ] **Step 2: Create all prompt files**

Convert ESM to CommonJS. These are mostly string templates with builder functions.

Key exports:
- `chat.js` → `module.exports = { buildSystemPrompt }`
- `doctorChat.js` → `module.exports = { buildDoctorSystemPrompt }`
- `goalNarrative.js` → `module.exports = { generateNarratives }`
- `pdfParser.js` → `module.exports = { pdfParserSystemPrompt, buildVisionParserContent }`

`goalNarrative.js` imports `generateText` and `extractJSON` from providers/ai — update import path.

Create directory first: `mkdir -p src/prompts`

- [ ] **Step 3: Commit**

```bash
git add src/prompts/
git commit -m "feat: add system prompts for patient chat, doctor chat, goal narratives, and PDF parser"
```

---

## Task 8: Port tools

**Files:**
- Create: `src/tools/getMedicalData.js`
- Create: `src/tools/getWearableData.js`
- Create: `src/tools/searchChatHistory.js`
- Create: `src/tools/fetchFullChat.js`
- Create: `src/tools/webSearch.js`
- Create: `src/tools/searchMedicalEvidence.js`
- Create: `src/tools/suggestMedication.js`
- Create: `src/tools/getSchemaInfo.js`
- Create: `src/tools/episodicMemory.js`

- [ ] **Step 1: Read all Backend B tool files**

Read from `/home/kerito/Desktop/Playground/cyborg/backend/src/tools/`: getMedicalData.js, getWearableData.js, searchChatHistory.js, fetchFullChat.js, webSearch.js, searchMedicalEvidence.js, suggestMedication.js, getSchemaInfo.js, episodicMemory.js

- [ ] **Step 2: Create all tool files**

Convert ESM to CommonJS. Each tool exports:
- `definition` — Claude tool schema (name, description, input_schema)
- `execute(input, userId, chatId)` — async function returning result object

Update model/service imports to CommonJS paths.

Key notes:
- `getMedicalData.js` imports User, ReportData models
- `getWearableData.js` imports WearableData model + wearableTrends service
- `searchChatHistory.js` imports ChatSummary model + embeddings service
- `fetchFullChat.js` imports Chat model
- `webSearch.js` imports perplexity service
- `searchMedicalEvidence.js` imports perplexity service
- `suggestMedication.js` is self-contained (hardcoded product catalog)
- `getSchemaInfo.js` imports schemaBuilder utility
- `episodicMemory.js` imports Memory model + embeddings service

Create directory first: `mkdir -p src/tools`

- [ ] **Step 3: Commit**

```bash
git add src/tools/
git commit -m "feat: add 10 AI chat tools (medical data, wearables, memory, web search, etc.)"
```

---

## Task 9: Rewrite report controller and update user controller

Replace Backend A's simple file-storage blood report with Backend B's vision-parsing pipeline. The upload endpoint now parses reports via AI vision, normalizes biomarkers, computes scores.

**Files:**
- Create: `src/controllers/reportController.js`
- Modify: `src/controllers/userController.js` — remove action plan functions and old blood report imports
- Modify: `src/routes/userRoutes.js` — remove action plan routes, add new report endpoints

- [ ] **Step 1: Read Backend B report route for logic**

Read `/home/kerito/Desktop/Playground/cyborg/backend/src/routes/reports.js` — this contains the full report CRUD + parsing logic inline in Fastify routes. We need to extract this into an Express controller.

- [ ] **Step 2: Create reportController.js**

Write a new Express controller with these functions, porting the logic from Backend B's `routes/reports.js`:

- `uploadReport(req, res, next)` — handles multipart upload, reads file buffer, calls `parseVision()` from ai provider with pdfParser prompt, runs `normalizeTests()`, `computeDerivedBiomarkers()`, `buildFullBiomarkerPanel()`, `computeScores()`, creates ReportData doc, updates User.bloodReport + User.bloodReports array
- `listReports(req, res, next)` — returns all user reports sorted by date with summary stats
- `getReport(req, res, next)` — returns single report full detail
- `updateReport(req, res, next)` — update reportLabel/reportDate
- `deleteReport(req, res, next)` — delete report, update User refs
- `getBiomarkers(req, res, next)` — unique biomarker names across reports
- `getBiomarkerPanel(req, res, next)` — latest report's full panel
- `getBiomarkerTimeline(req, res, next)` — biomarker values across time

All functions use `res.sendSuccess()`/`res.sendError()` pattern.

- [ ] **Step 3: Update userController.js**

Remove these from `src/controllers/userController.js`:
- Remove imports: `BloodReport`, `axios`, `analyzeBloodReport`, `prepareAIAnalysisData`, `actionPlanController`
- Remove functions: `uploadBloodReport`, `processBloodReportWithAI`, `getBloodReports`, `getBloodReport`, `deleteBloodReport`, `generateActionPlan`, `getActionPlan`
- Update exports to remove deleted functions

Keep: `saveOnboardingAnswers`, `getOnboardingAnswers`, `saveReferralSource`, `getReferralSource`, `getUserProfile`, `updateUserProfile`, `markWelcomeSeen`, `getAllUsers`

Update `getUserProfile` to populate `bloodReports` with `"ReportData"` ref instead of `"BloodReport"`.

- [ ] **Step 4: Update userRoutes.js**

Remove action plan routes (lines 89-102). Remove blood report routes (lines 49-87). These move to a dedicated report section in userRoutes or a new route file. Add new report routes:

```javascript
const reportController = require("../controllers/reportController");

// Blood Reports (using ReportData)
router.post("/:userId/blood-reports", verifyToken, checkRole(["user"]), upload.single("file"), reportController.uploadReport);
router.get("/:userId/blood-reports", verifyToken, reportController.listReports);
router.get("/blood-reports/:reportId", verifyToken, reportController.getReport);
router.patch("/blood-reports/:reportId", verifyToken, reportController.updateReport);
router.delete("/:userId/blood-reports/:reportId", verifyToken, checkRole(["user"]), reportController.deleteReport);
router.get("/blood-reports/biomarkers", verifyToken, reportController.getBiomarkers);
router.get("/blood-reports/biomarker-panel", verifyToken, reportController.getBiomarkerPanel);
router.get("/blood-reports/timeline/:canonicalName", verifyToken, reportController.getBiomarkerTimeline);
```

- [ ] **Step 5: Commit**

```bash
git add src/controllers/reportController.js src/controllers/userController.js src/routes/userRoutes.js
git commit -m "feat: replace simple blood report storage with vision-parsed ReportData pipeline"
```

---

## Task 10: Create chat controller and routes

Port Backend B's agentic chat system to Express. The main complexity is SSE streaming — Express uses `res.write()` instead of Fastify's `reply.hijack()`.

**Files:**
- Create: `src/controllers/chatController.js` (new version)
- Create: `src/routes/chatRoutes.js` (new version)

- [ ] **Step 1: Read Backend B chat route**

Read `/home/kerito/Desktop/Playground/cyborg/backend/src/routes/chat.js` — contains TOOLS array, sanitizeForModel(), executeToolByName(), SSE streaming logic, post-processing trigger.

- [ ] **Step 2: Create chatController.js**

Port all logic into Express controller functions:

- `listChats(req, res, next)` — list patient chats (chatType: 'patient'), sorted by updatedAt desc. Uses `req.user.id` from verifyToken.
- `createChat(req, res, next)` — create new Chat with userId and chatType 'patient'
- `getChat(req, res, next)` — get single chat by ID, verify ownership
- `sendMessage(req, res, next)` — THE MAIN HANDLER. This is the SSE streaming endpoint:
  1. Load chat, append user message, save
  2. Build context messages (trimmed to 30)
  3. Get user context (User + CoreFacts)
  4. Build system prompt (3-block structure)
  5. Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  6. Call `streamChat()` from ai provider with emit function that writes SSE events via `res.write()`
  7. On completion: save assistant message, auto-set title, fire postProcessing
  8. Close with `res.end()`
- `updateChat(req, res, next)` — update title
- `deleteChat(req, res, next)` — delete chat

Include the TOOLS array, sanitizeForModel(), and executeToolByName() as module-level helpers in this controller.

SSE emit function pattern for Express:
```javascript
const emit = (data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};
```

- [ ] **Step 3: Create chatRoutes.js**

```javascript
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, chatController.listChats);
router.post("/", verifyToken, chatController.createChat);
router.get("/:id", verifyToken, chatController.getChat);
router.post("/:id/messages", verifyToken, chatController.sendMessage);
router.patch("/:id", verifyToken, chatController.updateChat);
router.delete("/:id", verifyToken, chatController.deleteChat);

module.exports = router;
```

- [ ] **Step 4: Commit**

```bash
git add src/controllers/chatController.js src/routes/chatRoutes.js
git commit -m "feat: add agentic AI chat system with SSE streaming and 10 tools"
```

---

## Task 11: Create doctor controller and routes

Similar to chat but operates on patient's data with clinical system prompt.

**Files:**
- Create: `src/controllers/doctorController.js` (new version)
- Create: `src/routes/doctorRoutes.js` (new version)

- [ ] **Step 1: Read Backend B doctor route**

Read `/home/kerito/Desktop/Playground/cyborg/backend/src/routes/doctor.js`

- [ ] **Step 2: Create doctorController.js**

Port all logic into Express controller:

- `listPatients(req, res, next)` — list all users with userType 'user'
- `getPatient(req, res, next)` — get patient detail with CoreFacts
- `listDoctorChats(req, res, next)` — list chats with chatType 'doctor', optional `?patientId` filter
- `createDoctorChat(req, res, next)` — create doctor chat with patientId
- `getDoctorChat(req, res, next)` — get doctor chat detail
- `sendDoctorMessage(req, res, next)` — SSE streaming, same as patient but:
  - Uses `buildDoctorSystemPrompt()` instead of `buildSystemPrompt()`
  - Only 8 tools (no saveMemory/recallMemories)
  - Tool execution operates on patientId's data, not doctor's
- `updateDoctorChat(req, res, next)` — update title
- `deleteDoctorChat(req, res, next)` — delete chat

- [ ] **Step 3: Create doctorRoutes.js**

```javascript
const express = require("express");
const router = express.Router();
const doctorController = require("../controllers/doctorController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");

router.get("/patients", verifyToken, checkRole(["doctor"]), doctorController.listPatients);
router.get("/patients/:patientId", verifyToken, checkRole(["doctor"]), doctorController.getPatient);
router.get("/chats", verifyToken, checkRole(["doctor"]), doctorController.listDoctorChats);
router.post("/chats", verifyToken, checkRole(["doctor"]), doctorController.createDoctorChat);
router.get("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.getDoctorChat);
router.post("/chats/:id/messages", verifyToken, checkRole(["doctor"]), doctorController.sendDoctorMessage);
router.patch("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.updateDoctorChat);
router.delete("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.deleteDoctorChat);

module.exports = router;
```

- [ ] **Step 4: Commit**

```bash
git add src/controllers/doctorController.js src/routes/doctorRoutes.js
git commit -m "feat: add doctor AI assistant with patient-scoped chat and clinical prompts"
```

---

## Task 12: Create goal and agent controllers/routes

**Files:**
- Create: `src/controllers/goalController.js`
- Create: `src/controllers/agentController.js`
- Create: `src/routes/goalRoutes.js`
- Create: `src/routes/agentRoutes.js`

- [ ] **Step 1: Read Backend B goal and agent routes**

Read `/home/kerito/Desktop/Playground/cyborg/backend/src/routes/goals.js` and `/home/kerito/Desktop/Playground/cyborg/backend/src/routes/agent.js`

- [ ] **Step 2: Create goalController.js**

```javascript
const { generateGoalCards } = require("../services/goalsEngine");

const listGoals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { goals, meta } = await generateGoalCards(userId);
    const summaryGoals = goals.map(g => ({
      goalId: g.goalId, title: g.title, priority: g.priority,
      healthImpact: g.healthImpact, summary: g.summary, recoveryTimeWeeks: g.recoveryTimeWeeks,
    }));
    res.sendSuccess({ goals: summaryGoals, meta }, "Goals retrieved");
  } catch (error) {
    if (error.code === "NO_REPORT") return res.sendError("No report found. Upload a blood report first.", 404);
    next(error);
  }
};

const getGoal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;
    const { goals } = await generateGoalCards(userId);
    const goal = goals.find(g => g.goalId === goalId);
    if (!goal) return res.sendError("Goal not found", 404);
    res.sendSuccess(goal, "Goal retrieved");
  } catch (error) {
    if (error.code === "NO_REPORT") return res.sendError("No report found", 404);
    next(error);
  }
};

module.exports = { listGoals, getGoal };
```

- [ ] **Step 3: Create agentController.js**

Port from Backend B's `routes/agent.js`. Handles server-to-server report parsing:
- `parseReport(req, res, next)` — accepts `{ userId, fileUrl }` or `{ userId, bloodReportId }`, resolves file, runs vision parser + normalization + scoring, creates ReportData, updates User

- [ ] **Step 4: Create goalRoutes.js**

```javascript
const express = require("express");
const router = express.Router();
const goalController = require("../controllers/goalController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, goalController.listGoals);
router.get("/:goalId", verifyToken, goalController.getGoal);

module.exports = router;
```

- [ ] **Step 5: Create agentRoutes.js**

```javascript
const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agentController");

router.post("/parse-report", agentController.parseReport);

module.exports = router;
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/goalController.js src/controllers/agentController.js src/routes/goalRoutes.js src/routes/agentRoutes.js
git commit -m "feat: add goal cards and agent report parsing endpoints"
```

---

## Task 13: Update app.js and server.js

Wire everything together.

**Files:**
- Modify: `src/app.js` — remove old route imports/mounts, add new ones
- Modify: `src/server.js` — add vector DB connection + schema builder
- Modify: `src/config/multer.js` — add WEBP support

- [ ] **Step 1: Update app.js**

Replace route imports and mounts. Remove: actionPlanRoutes, old chatRoutes, conciergeRoutes, old doctorRoutes. Add: new chatRoutes, new doctorRoutes, goalRoutes, agentRoutes.

Final route mounts should be:
```javascript
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/questionnaire", questionnaireRoutes);
app.use("/api/chats", chatRoutes);       // NEW — agentic chat
app.use("/api/doctor", doctorRoutes);    // NEW — doctor AI
app.use("/api/goals", goalRoutes);       // NEW — goal cards
app.use("/api/agent", agentRoutes);      // NEW — server-to-server
```

Note: chat route prefix changes from `/api/chat` to `/api/chats` (plural, matching Backend B's CRUD pattern).

- [ ] **Step 2: Update server.js**

Add after DB connection:
```javascript
const { buildDatabaseSchema } = require("./utils/schemaBuilder");

connectDB().then(() => {
  seedQuestionnaire();
  buildDatabaseSchema().catch(err => console.error("Schema build failed:", err.message));
});
```

- [ ] **Step 3: Update multer.js**

Add WEBP to allowed types:
- Add `"image/webp"` to allowedMimeTypes
- Add `".webp"` to allowed extensions
- Increase file size limit from 10MB to 20MB (matching Backend B)

- [ ] **Step 4: Commit**

```bash
git add src/app.js src/server.js src/config/multer.js
git commit -m "feat: wire up all new routes, add WEBP support, init schema builder on startup"
```

---

## Task 14: Verification

Verify every ported feature matches Backend B's original logic and Backend A's existing features still work.

**Files:** All files in the project

- [ ] **Step 1: Check for broken imports**

```bash
cd /home/kerito/Desktop/temp/cyborg-backend
node -e "require('./src/app')" 2>&1
```

Fix any `Cannot find module` or `is not a function` errors.

- [ ] **Step 2: Verify all models load**

```bash
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const models = [
  './src/models/User', './src/models/ReportData', './src/models/Chat',
  './src/models/WearableData', './src/models/SchemaInfo',
  './src/models/Notification', './src/models/Subscription',
  './src/models/OnboardingAnswer', './src/models/Questionnaire',
  './src/models/ReferralSource'
];
models.forEach(m => { try { require(m); console.log('OK:', m); } catch(e) { console.error('FAIL:', m, e.message); } });
// Vector DB models (Memory, CoreFact, ChatSummary) need VECTOR_DB_URI to load
console.log('All main models loaded');
"
```

- [ ] **Step 3: Verify route registration**

```bash
node -e "
require('dotenv').config();
const app = require('./src/app');
const routes = [];
app._router.stack.forEach(r => {
  if (r.route) routes.push(r.route.path);
  if (r.name === 'router' && r.handle.stack) {
    r.handle.stack.forEach(s => { if (s.route) routes.push(s.route.path); });
  }
});
console.log('Registered routes:', routes.length);
"
```

- [ ] **Step 4: Cross-reference every Backend B endpoint**

For each endpoint in Backend B, verify the equivalent exists in the merged backend with matching:
- HTTP method and path
- Middleware chain (verifyToken, checkRole where needed)
- Request/response shape
- DB queries and business logic

Endpoints to verify:
1. `GET /api/chats` — list patient chats
2. `POST /api/chats` — create chat
3. `GET /api/chats/:id` — get chat
4. `POST /api/chats/:id/messages` — SSE streaming chat
5. `PATCH /api/chats/:id` — update title
6. `DELETE /api/chats/:id` — delete chat
7. `GET /api/doctor/patients` — list patients
8. `GET /api/doctor/patients/:patientId` — patient detail
9. `GET /api/doctor/chats` — list doctor chats
10. `POST /api/doctor/chats` — create doctor chat
11. `GET /api/doctor/chats/:id` — get doctor chat
12. `POST /api/doctor/chats/:id/messages` — doctor SSE streaming
13. `PATCH /api/doctor/chats/:id` — update doctor chat title
14. `DELETE /api/doctor/chats/:id` — delete doctor chat
15. `POST /api/users/:userId/blood-reports` — upload + parse
16. `GET /api/users/:userId/blood-reports` — list reports
17. `GET /api/users/blood-reports/:reportId` — report detail
18. `PATCH /api/users/blood-reports/:reportId` — update label/date
19. `DELETE /api/users/:userId/blood-reports/:reportId` — delete report
20. `GET /api/users/blood-reports/biomarkers` — biomarker names
21. `GET /api/users/blood-reports/biomarker-panel` — latest panel
22. `GET /api/users/blood-reports/timeline/:canonicalName` — biomarker trend
23. `GET /api/goals` — goal cards
24. `GET /api/goals/:goalId` — goal detail
25. `POST /api/agent/parse-report` — server-to-server parsing

Also verify Backend A's original endpoints still work:
26. `POST /api/auth/register` — register
27. `POST /api/auth/login` — login
28. All other auth endpoints
29. `GET/POST /api/payments/*` — all payment endpoints
30. `GET/PATCH /api/notifications/*` — notification endpoints
31. `GET/PUT /api/questionnaire` — questionnaire endpoints

- [ ] **Step 5: Verify SSE streaming works in Express**

The critical test — ensure `res.write()` based SSE produces the same event format as Backend B's Fastify `reply.hijack()`:
- `data: {"type":"textDelta","text":"..."}\n\n`
- `data: {"type":"toolStart","name":"..."}\n\n`
- `data: {"type":"toolEnd","name":"...","ok":true}\n\n`
- `data: {"type":"thinkingDelta","text":"..."}\n\n`
- `data: {"type":"done",...}\n\n`
- `data: {"type":"error","message":"..."}\n\n`

- [ ] **Step 6: Verify tool execution**

For each of the 10 tools, verify the tool definition + execute function work:
1. getMedicalData — queries User, ReportData
2. getWearableData — queries WearableData, computes trends
3. searchChatHistory — vector or keyword search on ChatSummary
4. fetchFullChat — loads Chat by ID
5. webSearch — calls Perplexity Sonar
6. searchMedicalEvidence — calls Perplexity Sonar Pro
7. suggestMedication — returns product catalog
8. getSchemaInfo — reads SchemaInfo collection
9. saveMemory — creates Memory with embedding + dedup
10. recallMemories — vector or keyword search on Memory

- [ ] **Step 7: Verify report pipeline**

Upload flow must produce same output as Backend B:
1. File received via multer
2. Buffer read from disk
3. `parseVision()` called with pdfParser prompt → structured JSON
4. `normalizeTests()` maps to canonical biomarkers
5. `computeDerivedBiomarkers()` adds derived values
6. `buildFullBiomarkerPanel()` builds full panel
7. `computeScores()` generates Cyborg Score, BioAge, grades
8. ReportData doc saved with all fields
9. User.bloodReport and User.bloodReports updated

- [ ] **Step 8: Verify goals pipeline**

Goal generation must follow Backend B's 3-layer pipeline:
1. `detectIssues()` scans biomarkers, onboarding, wearables
2. `generateGoals()` maps issues to goal templates
3. `generateNarratives()` adds AI-generated text
4. Response includes goals array + meta stats

- [ ] **Step 9: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: resolve integration issues found during verification"
```
