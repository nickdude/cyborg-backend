# Meal Logging v1 — Backend Design

**Status:** Draft → pending user review
**Author:** session 2026-04-16
**Scope:** Backend endpoints, data model, and AI pipeline for logging meals from food images and/or text descriptions. Frontend is out of scope for this spec.

---

## Context

Users need to log meals by snapping one or more photos of their food, optionally with a text description. An AI model estimates calories, macros (protein / carbs / fat), fiber, sugar, and a per-item breakdown. The user reviews and edits the estimate on a Review screen, then saves — producing a meal record in their daily log.

The flow is **analyze → review → commit**: AI estimates are never auto-saved. This matches every successful food-tracker app and is honest about AI uncertainty.

## Scope

**In scope**

- `POST /meals/analyze` — accept 0..N images plus optional text, return a meal estimate without saving.
- `POST /meals` — commit a finalized meal (user-edited or accepted as-is).
- `GET /meals?date=YYYY-MM-DD` — list meals for a day.
- `GET /meals/summary?date=YYYY-MM-DD` — day-aggregate totals.
- `PATCH /meals/:id` — edit a saved meal.
- `DELETE /meals/:id` — delete a saved meal and its images.
- `mealStorage` module for image persistence (local disk during dev, swap to Cloudflare R2 at deploy — same shape as the existing `reportStorage`).
- Orphan image GC strategy.

**Out of scope**

- Barcode scanning, manual food database search, recent/recipe reuse.
- Adding items to an already-saved meal (the Review screen's `Add Item` link and `ADD ADDITIONAL ITEMS` row).
- Meal-type classification (breakfast / lunch / dinner / snack).
- Daily calorie / macro targets — the Review screen doesn't show them; the parent screen only shows running consumed totals.
- Any frontend work.

---

## API Contract

All routes are mounted under `/api/users` and require JWT authentication via `verifyToken` plus `checkRole(["user"])`.

### POST `/:userId/meals/analyze`

Runs Claude vision on the provided images and/or text. Returns a per-item estimate. **Does not persist a meal** — only stores the uploaded images in a `pending/` prefix so the commit endpoint can reference them without re-upload.

**Request** (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `images` | file × N | at least one of `images` or `description` | Any of `application/pdf` not allowed; only `image/jpeg`, `image/png`, `image/webp`. Multer limit 10 MB per file, max 5 files. |
| `description` | string | at least one of `images` or `description` | Freeform user text, e.g. `"chicken salad with mayo"`. |

**Response** (`200`)

```json
{
  "estimate": {
    "title": null,
    "totals": { "calories": 90, "proteinG": 2, "carbsG": 24, "fatG": 0, "fiberG": 2, "sugarG": 20 },
    "items": [
      {
        "name": "Watermelon",
        "portion": { "quantity": 3, "unit": "pieces", "grams": 150 },
        "calories": 45, "proteinG": 1, "carbsG": 12, "fatG": 0, "fiberG": 1, "sugarG": 10
      }
    ],
    "confidence": "medium",
    "notFood": false,
    "notes": null
  },
  "imageKeys": ["meal-images/pending/<uuid>.jpg"]
}
```

**Behaviour**

- If neither `images` nor `description` are provided → `400` `"Provide an image or a description."`.
- If the model determines no food is present in any input, return `200` with `"notFood": true` and empty items; UI shows a retry prompt.
- If the input is partial (text alone, one image alone), the model still returns a best-effort estimate with lowered `confidence`.
- `title` is always `null` at this stage — the commit endpoint fills it in if the user doesn't override.

### POST `/:userId/meals`

Commits a finalized meal. Expects `imageKeys` from a prior `/analyze` call (if images were used).

**Request** (`application/json`)

```json
{
  "title": "Lunch" | null,
  "consumedAt": "2026-04-16T12:24:00Z",
  "totals": { "calories": 90, "proteinG": 2, "carbsG": 24, "fatG": 0, "fiberG": 2, "sugarG": 20 },
  "items": [ /* same shape as /analyze */ ],
  "imageKeys": ["meal-images/pending/<uuid>.jpg"],
  "inputText": "A small plate of watermelon" | null
}
```

**Behaviour**

- Validates `imageKeys` — each must belong to the calling user (we store a `userId` tag on the image object when writing from `/analyze`) and live under `pending/`. Invalid keys → `400`.
- Promotes each image from `pending/` to `committed/`: local driver renames the file; R2 driver copies + deletes.
- If `title` is null/blank, the server auto-generates one from `items` (e.g. the first item's name; up to two items comma-joined).
- Writes the meal document with the new `imageKeys` pointing at `committed/` paths.
- Returns the saved meal document with `201`.

### GET `/:userId/meals?date=YYYY-MM-DD`

Returns meals whose `consumedAt` falls within the UTC day `YYYY-MM-DD`. Sorted by `consumedAt desc`.

**Response**

```json
[ { /* full meal doc */ }, ... ]
```

### GET `/:userId/meals/summary?date=YYYY-MM-DD`

Aggregates totals across the day. Used by the parent-screen counter (`0 items · 0 Cal 0P 0F 0C`).

**Response**

```json
{ "itemCount": 3, "calories": 1420, "proteinG": 82, "carbsG": 145, "fatG": 45, "fiberG": 18, "sugarG": 60 }
```

`itemCount` is the total number of food items across all meals that day (sum of `items.length` across meals), not the number of meals. Implemented via Mongo aggregation (`$match date-range → $unwind items → $group sum`).

### PATCH `/:userId/meals/:mealId`

Partial update. Accepts any subset of `title`, `consumedAt`, `totals`, `items`, `inputText`.

**Not allowed via PATCH:** `imageKeys`, `userId`, `_id`, `modelUsed`, `tokensUsed`. Images are immutable once committed — if the user wants a different photo they must delete and re-create the meal.

### DELETE `/:userId/meals/:mealId`

Deletes the meal document and best-effort removes every image in its `imageKeys` from storage. Non-throwing on storage errors.

---

## Data Model

New Mongoose model in `src/models/Meal.js`, collection `meals`.

```js
{
  userId: ObjectId,                   // indexed
  title: String,
  consumedAt: Date,                   // indexed (compound with userId)
  createdAt: Date,                    // timestamps
  updatedAt: Date,

  totals: {
    calories: Number,
    proteinG: Number, carbsG: Number, fatG: Number,
    fiberG: Number,  sugarG: Number,
  },

  items: [{
    _id: false,
    name: String,
    portion: { quantity: Number, unit: String, grams: Number },
    calories: Number,
    proteinG: Number, carbsG: Number, fatG: Number,
    fiberG: Number,  sugarG: Number,
  }],

  imageKeys: [String],
  inputText: { type: String, default: null },
  confidence: { type: String, enum: ["low", "medium", "high", null], default: null },
  modelUsed: String,
  tokensUsed: { input: Number, output: Number },
}
```

**Indexes**

- `{ userId: 1, consumedAt: -1 }` — primary read path for list and summary queries.

All numeric fields are plain `Number`. No validation on macro ratios — the AI is authoritative; the user can override anything.

---

## Storage Strategy

### Module: `src/utils/mealStorage.js`

Interface modeled on the existing `reportStorage` but named for meals:

```js
save(buffer, mimeType) → key            // writes to pending/, returns the generated key
promote(key) → newKey                    // pending/ → committed/, returns the new key
delete(key)                              // removes (no-op if missing)
pathFor(key) → absolutePath              // for streaming or reading back
```

Callers pass the key they got from `save` back to `promote` or `delete`. Keys are uuid-based and include the prefix (e.g. `meal-images/pending/<uuid>.jpg`).

**Dev (local disk).** Files live under `uploads/meal-images/pending/<uuid>.<ext>` and `uploads/meal-images/committed/<uuid>.<ext>`. Keys are uuid-based, not tied to any user or meal id — the DB is the source of truth for ownership.

**Deploy (R2).** Replace the module's internals with the AWS S3 SDK pointed at R2. Configure a bucket lifecycle rule: *"delete objects under `meal-images/pending/` older than 24h."* The promote step becomes a copy + delete from `pending/` to `committed/`. All app code is unchanged.

### Orphan cleanup

- **Dev:** a small `scripts/gcMealImages.js` script runs daily (cron), diffs on-disk `pending/` keys against `meals.imageKeys`, deletes anything on disk older than 24h that isn't referenced.
- **Deploy:** the R2 lifecycle rule handles it. The Node cron is deleted.

No in-app scheduler is introduced — dev cleanup can run from `package.json` `scripts` via the host's cron or a manual invocation. This matches the project's existing "no background workers" stance.

---

## AI Pipeline

Reuse `providers/ai.parseVision` — already handles multi-image inputs.

**New prompt:** `src/prompts/mealParser.js` exports `mealParserSystemPrompt` — instructs the model to return the exact JSON shape in the `/analyze` response section above. The prompt is explicit that:

- `notFood: true` + empty `items` is the *only* valid "empty" response, and only when there is zero food signal.
- Partial inputs (text alone, one of many images) still require a best-effort estimate with lowered `confidence`.
- Numbers must be integers for calories and floats/integers for grams.
- Output must be raw JSON — no markdown fences.

**User prompt:** `"Analyze the following food. Images: N. Description: <text or '(none)'>."`

**Transport:** `anthropic.messages.stream(...).finalMessage()` — same streaming-required-at-high-max_tokens constraint as blood reports. `max_tokens` configurable via `CLAUDE_MEAL_MAX_TOKENS` env, default `8192` (meal responses are far smaller than full lab reports).

**JSON parsing:** reuse `extractJSON` including the truncation-repair fallback from the upload pipeline.

**Forensic dumps:** on parse failure, dump the raw response + context to `uploads/failed-parses/meal-*.txt`, same pattern as blood reports.

---

## Error Handling

| Condition | HTTP | Message |
|---|---|---|
| No image & no description | 400 | "Provide an image or a description." |
| Unsupported image type | 400 | "Only JPG, PNG, and WebP images are supported." |
| Image > 10 MB | 400 | "Each image must be 10 MB or smaller." |
| More than 5 images | 400 | "Upload up to 5 images per meal." |
| Claude API error | 502 | "Couldn't analyze this meal. Try again in a moment." |
| JSON unparseable after repair | 502 | "Couldn't read the analysis. Try a clearer photo or simpler description." |
| Image storage write fails on `/analyze` | 500 | "Couldn't save your photos. Try again." (no DB write happens) |
| `imageKeys` don't belong to user on `/commit` | 400 | "Invalid image reference." |
| `imageKeys` promotion fails on `/commit` | 500 | "Couldn't finalize meal. Try again." (DB write rolled back) |
| `notFood: true` | 200 | Body contains `notFood: true`; UI surfaces its own message. |

Raw LLM output is never returned to the client — always server-side logs only, matching the blood-report hardening.

---

## File Layout

New files:

- `src/models/Meal.js`
- `src/controllers/mealController.js`
- `src/routes/mealRoutes.js` (mounted inside the users route group — matches existing convention)
- `src/prompts/mealParser.js`
- `src/utils/mealStorage.js`
- `scripts/gcMealImages.js`
- `docs/superpowers/specs/2026-04-16-meal-logging-design.md` (this file)

Edited files:

- `src/routes/userRoutes.js` — mount meal routes
- `src/app.js` — no change expected; routes are under the existing users prefix

---

## Testing

No automated tests exist in the repo today. This spec does not introduce a framework. Manual verification checklist:

- Upload 1 image, no text → get estimate → commit → appears in `GET /meals?date=today`.
- Upload 3 images, with description → commit → all three images readable via their committed paths.
- Text only, no image → commit → stored with empty `imageKeys`.
- Invalid empty request → 400.
- 11 MB image → 400.
- 6 images → 400.
- Delete meal → `GET /meals/:id` → 404, and the image files no longer exist on disk.
- `GET /meals/summary` returns correct aggregates across multiple meals in a day.
- Orphan GC script: upload via `/analyze`, don't commit, wait 24h (or set TTL to 1 min for testing), run script, verify file removed.

---

## Open Questions

None blocking. Two non-blocking items to settle during implementation:

1. **Auto-title format** when user leaves the title blank on commit — currently spec'd as "first item, or first two items comma-joined". If that produces noisy titles in practice, revisit.
2. **Item-level image attribution** — do we ever need to know which image a given item came from? Not needed for v1 UI, not included in this spec.
