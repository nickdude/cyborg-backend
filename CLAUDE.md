# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cyborg Healthcare Backend — a Node.js/Express REST API for a health optimization platform. Features JWT auth with OTP verification, blood report uploads with AI-powered action plan generation, Razorpay payment subscriptions, and role-based access (user vs doctor).

## Commands

```bash
npm run dev          # Start dev server with nodemon (default port 5000)
```

No test suite is configured. No linter is configured.

## Required Environment Variables

`MONGO_URI`, `JWT_SECRET`, `PORT`, `EMAIL_USER`, `EMAIL_PASS`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `REAL_AI_API_URL`, `REAL_AI_API_KEY`, `USE_REAL_AI`

## Architecture

**Stack:** Express.js v5 + MongoDB/Mongoose + JWT auth

**Entry point:** `src/server.js` → connects to MongoDB, seeds questionnaire, starts Express app from `src/app.js`.

**Layer pattern (MVC):**
- `src/routes/` — 9 route files defining endpoints with middleware chains
- `src/controllers/` — Request handling and business logic
- `src/models/` — 8 Mongoose schemas (User, ActionPlan, BloodReport, Subscription, Questionnaire, OnboardingAnswer, ReferralSource, Notification)
- `src/middlewares/` — Auth (JWT verify + role check), response formatting, error handling, input validation
- `src/utils/` — Email (nodemailer/Gmail), token generation, PDF export (pdfkit), AI services
- `src/config/` — DB connection (`db.js`), file upload config (`multer.js`)

**Route groups:**
- Public: `/api/auth/*`, `/api/questionnaire`, `/api/chat`
- Authenticated (JWT): `/api/users/*`, `/api/payments/*`, `/api/notifications/*`, `/api/action-plans/*`
- Doctor-only: `/api/doctor/*` (uses `checkRole(["doctor"])`)

## Key Patterns

**Response format:** All controllers use `res.sendSuccess()` / `res.sendError()` — attached by `responseHandler` middleware. Every response includes `success`, `statusCode`, `message`, `data`, `timestamp`.

**Auth flow:** Register → OTP verification → Login → OTP verification → JWT token (7-day expiry). Token payload: `{id, email, phone, userType}`.

**Action plan generation:** Async job pattern — blood report uploaded → job submitted to external AI API (`realAIService.js`) → status tracked in ActionPlan model → client polls for completion. Falls back to `mockAI.js` when `USE_REAL_AI` is not set.

**File uploads:** Multer disk storage to `uploads/blood-reports/`, 10MB limit, PDF/JPG/PNG only.

**Payments:** Razorpay integration with order creation → client-side payment → signature verification → subscription record. Plans: basic, premium, membership. Currency: INR (amounts in paise).
