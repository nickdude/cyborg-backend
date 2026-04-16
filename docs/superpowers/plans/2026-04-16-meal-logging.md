# Meal Logging v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend for meal logging: image(s) + text → AI estimate → review-and-commit → meal history.

**Architecture:** Two-step analyze-then-commit flow. `POST /meals/analyze` stores images in a `pending/` prefix and returns an AI estimate without persisting a meal. User reviews/edits, then `POST /meals` commits — promoting images to `committed/`. Images behind a storage module that swaps cleanly to Cloudflare R2 at deploy time. Follows every pattern already established by the blood-report upload (streaming Claude, `extractJSON` repair, forensic dumps, sendSuccess/sendError envelope).

**Tech Stack:** Node.js 20 · Express 5 · Mongoose · Multer · @anthropic-ai/sdk (already wired in `providers/ai.js`).

**Reference spec:** `docs/superpowers/specs/2026-04-16-meal-logging-design.md`.

**Test framework:** None in this repo (per the project CLAUDE.md). Each task ends with a manual verification command. Do not skip verification.

---

## File Structure

Files the plan creates or modifies:

| File | Action | Responsibility |
|---|---|---|
| `src/models/Meal.js` | create | Mongoose schema + indexes |
| `src/utils/mealStorage.js` | create | Local-disk storage module behind a driver interface (pending/committed prefixes) |
| `src/config/mealUpload.js` | create | Multer config specific to meal images (5-file, 10 MB each, images only) |
| `src/prompts/mealParser.js` | create | System prompt instructing Claude on the meal-estimate JSON shape |
| `src/controllers/mealController.js` | create | All six endpoint handlers |
| `src/routes/mealRoutes.js` | create | Route definitions, middleware wiring |
| `src/app.js` | modify | Mount mealRoutes at `/api/users` |
| `scripts/gcMealImages.js` | create | Orphan-image garbage collector for dev; no-op once R2 lifecycle takes over |

---

## Task 1: Meal Mongoose Model

**Files:**
- Create: `src/models/Meal.js`

- [ ] **Step 1: Create the model file**

Create `src/models/Meal.js` with this exact content:

```js
const mongoose = require("mongoose");

const portionSchema = new mongoose.Schema(
  {
    quantity: { type: Number, default: null },
    unit: { type: String, default: null },
    grams: { type: Number, default: null },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    portion: { type: portionSchema, default: () => ({}) },
    calories: { type: Number, default: 0 },
    proteinG: { type: Number, default: 0 },
    carbsG: { type: Number, default: 0 },
    fatG: { type: Number, default: 0 },
    fiberG: { type: Number, default: 0 },
    sugarG: { type: Number, default: 0 },
  },
  { _id: false }
);

const totalsSchema = new mongoose.Schema(
  {
    calories: { type: Number, default: 0 },
    proteinG: { type: Number, default: 0 },
    carbsG: { type: Number, default: 0 },
    fatG: { type: Number, default: 0 },
    fiberG: { type: Number, default: 0 },
    sugarG: { type: Number, default: 0 },
  },
  { _id: false }
);

const mealSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "" },
    consumedAt: { type: Date, required: true },
    totals: { type: totalsSchema, default: () => ({}) },
    items: { type: [itemSchema], default: [] },
    imageKeys: { type: [String], default: [] },
    inputText: { type: String, default: null },
    confidence: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    modelUsed: { type: String, default: "" },
    tokensUsed: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: "meals" }
);

mealSchema.index({ userId: 1, consumedAt: -1 });

module.exports = mongoose.model("Meal", mealSchema);
```

- [ ] **Step 2: Verify the model loads and registers**

Run from `cyborg-backend/`:

```bash
node -e 'require("dotenv").config({ quiet: true }); const m = require("./src/models/Meal"); console.log("name:", m.modelName, "collection:", m.collection.collectionName, "paths:", Object.keys(m.schema.paths).sort().join(","));'
```

Expected: prints `name: Meal collection: meals paths: _id,confidence,consumedAt,createdAt,imageKeys,inputText,items,modelUsed,title,tokensUsed.input,tokensUsed.output,totals.calories,totals.carbsG,totals.fatG,totals.fiberG,totals.proteinG,totals.sugarG,updatedAt,userId`

- [ ] **Step 3: Commit**

```bash
git add src/models/Meal.js
git commit -m "feat(meals): add Meal mongoose model"
```

---

## Task 2: Meal Storage Module

**Files:**
- Create: `src/utils/mealStorage.js`

- [ ] **Step 1: Create the storage module**

Create `src/utils/mealStorage.js`:

```js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Local-disk storage for meal images. Same interface shape as reportStorage —
// swap the internals for an S3/R2 client at deploy time and nothing else
// needs to change. Keys are uuid-prefixed and carry their own path segment
// so the driver doesn't need to remember the prefix layout.
const BASE_DIR = process.env.MEAL_STORAGE_DIR || path.join("uploads", "meal-images");

function extFromMime(mime) {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

function ensureDir(dirAbs) {
  fs.mkdirSync(dirAbs, { recursive: true });
}

/**
 * Write `buffer` to the pending area. Returns an opaque key
 * like "meal-images/pending/<uuid>.jpg".
 */
function save(buffer, mimeType) {
  const pendingDir = path.join(BASE_DIR, "pending");
  ensureDir(pendingDir);
  const name = `${crypto.randomUUID()}${extFromMime(mimeType)}`;
  fs.writeFileSync(path.join(pendingDir, name), buffer);
  return path.join("meal-images", "pending", name);
}

/**
 * Move an image from pending/ to committed/. Returns the new key.
 * Throws if the source file doesn't exist.
 */
function promote(key) {
  if (!key || !key.includes("/pending/")) {
    throw new Error(`promote() expected a pending/ key, got: ${key}`);
  }
  const name = path.basename(key);
  const fromAbs = path.join(BASE_DIR, "pending", name);
  const committedDir = path.join(BASE_DIR, "committed");
  ensureDir(committedDir);
  const toAbs = path.join(committedDir, name);
  fs.renameSync(fromAbs, toAbs);
  return path.join("meal-images", "committed", name);
}

/** Non-throwing delete. */
function remove(key) {
  if (!key) return;
  try {
    fs.unlinkSync(pathFor(key));
  } catch (_) {}
}

/** Resolve a key back to an absolute filesystem path. */
function pathFor(key) {
  if (!key) return null;
  // key looks like "meal-images/pending/xxx.jpg" or "meal-images/committed/xxx.jpg"
  // Strip the leading "meal-images/" since BASE_DIR already ends there.
  const relative = key.startsWith("meal-images/") ? key.slice("meal-images/".length) : key;
  return path.join(BASE_DIR, relative);
}

module.exports = { save, promote, remove, pathFor, BASE_DIR };
```

- [ ] **Step 2: Verify save → promote → remove round-trip**

Run from `cyborg-backend/`:

```bash
node -e '
const storage = require("./src/utils/mealStorage");
const fs = require("fs");
const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // fake JPEG magic
const pendingKey = storage.save(buf, "image/jpeg");
console.log("pending key:", pendingKey);
console.log("on disk:", fs.existsSync(storage.pathFor(pendingKey)));
const committedKey = storage.promote(pendingKey);
console.log("committed key:", committedKey);
console.log("old path exists:", fs.existsSync(storage.pathFor(pendingKey)));
console.log("new path exists:", fs.existsSync(storage.pathFor(committedKey)));
storage.remove(committedKey);
console.log("after remove:", fs.existsSync(storage.pathFor(committedKey)));
'
```

Expected output:
```
pending key: meal-images/pending/<uuid>.jpg
on disk: true
committed key: meal-images/committed/<uuid>.jpg
old path exists: false
new path exists: true
after remove: false
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/mealStorage.js
git commit -m "feat(meals): add local-disk mealStorage module"
```

---

## Task 3: Meal Multer Config

**Files:**
- Create: `src/config/mealUpload.js`

- [ ] **Step 1: Create the multer config**

Create `src/config/mealUpload.js`:

```js
const multer = require("multer");

// Meals accept up to 5 images, 10 MB each, images only.
// Uses memoryStorage so the buffer lands in req.files[].buffer — no temp
// files on disk. This matches how we want mealStorage.save() to receive it.
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Only JPG, PNG, and WebP images are supported"), false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,
  },
});

module.exports = upload;
```

- [ ] **Step 2: Verify the module loads**

```bash
node -e 'const u = require("./src/config/mealUpload"); console.log("is function:", typeof u.array === "function");'
```

Expected: `is function: true`

- [ ] **Step 3: Commit**

```bash
git add src/config/mealUpload.js
git commit -m "feat(meals): add multer config for meal image uploads"
```

---

## Task 4: Meal Parser Prompt

**Files:**
- Create: `src/prompts/mealParser.js`

- [ ] **Step 1: Create the prompt file**

Create `src/prompts/mealParser.js`:

```js
const mealParserSystemPrompt = `You are a nutrition estimation assistant. Given one or more photos of food AND/OR a user's text description, return a single structured JSON estimate of what the user ate.

Return ONLY raw JSON — no markdown fences, no commentary.

Use this exact schema:

{
  "estimate": {
    "title": null,
    "totals": {
      "calories": number,
      "proteinG": number,
      "carbsG": number,
      "fatG": number,
      "fiberG": number,
      "sugarG": number
    },
    "items": [
      {
        "name": string,
        "portion": { "quantity": number | null, "unit": string | null, "grams": number | null },
        "calories": number,
        "proteinG": number,
        "carbsG": number,
        "fatG": number,
        "fiberG": number,
        "sugarG": number
      }
    ],
    "confidence": "low" | "medium" | "high",
    "notFood": boolean,
    "notes": string | null
  }
}

Rules:
- "items[]" contains one entry per distinct food item you see across all images AND any items mentioned in the description. Aggregate duplicates when they clearly refer to the same item.
- "totals" MUST equal the numeric sum of the corresponding fields across "items[]". Round to the nearest integer for calories; grams can be integers or one decimal place.
- Always return a best-effort estimate when ANY food signal is present in the images or the description. Lower "confidence" when inputs are partial, ambiguous, blurry, or text-only without portion cues.
- "notFood": true ONLY when there is zero food signal — no identifiable food in the images and no food words in the description. In that case return empty "items": [] and zero "totals".
- "title" must always be null at this stage — a human-facing title is generated later by the server.
- "confidence" values:
    "low"    = inputs are partial / blurry / guessing from text alone with no portion info
    "medium" = typical single-plate photo with ordinary visibility
    "high"   = clearly labeled items, explicit portion text, or close-up photos with obvious portions
- "notes": at most one short sentence (<120 chars) flagging the biggest uncertainty ("portion estimated from plate size", "assumed cooked weight", etc). null if nothing worth saying.
- All numeric fields must be real numbers. Never return strings for numbers.
- Use grams in "portion.grams" when you can infer weight. Use "unit" as shown to the user ("pieces", "cup", "slice", "bowl", "serving"). Set any field to null if you truly don't know.
- Do not include fields beyond the schema. Do not return markdown. Do not wrap the JSON in prose.
`;

module.exports = { mealParserSystemPrompt };
```

- [ ] **Step 2: Verify the prompt exports correctly**

```bash
node -e 'const p = require("./src/prompts/mealParser"); console.log("length:", p.mealParserSystemPrompt.length, "contains items[]:", p.mealParserSystemPrompt.includes("items[]"));'
```

Expected: `length: <some number > 1000> contains items[]: true`

- [ ] **Step 3: Commit**

```bash
git add src/prompts/mealParser.js
git commit -m "feat(meals): add Claude meal parser system prompt"
```

---

## Task 5: Meal Controller Skeleton + analyzeMeal

**Files:**
- Create: `src/controllers/mealController.js`

- [ ] **Step 1: Create the controller with shared helpers + the analyze handler**

Create `src/controllers/mealController.js`:

```js
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Meal = require("../models/Meal");
const mealStorage = require("../utils/mealStorage");
const { mealParserSystemPrompt } = require("../prompts/mealParser");
const { parseVision, extractJSON, getModelName } = require("../providers/ai");

const MEAL_ANALYZE_MAX_TOKENS =
  Number(process.env.CLAUDE_MEAL_MAX_TOKENS) || 8192;

// Build the multi-image Claude vision content block. parseVision() calls
// the provider which already wraps system/user prompts — we just pass the
// user-facing text here.
function buildUserPrompt(description, imageCount) {
  const desc = (description || "").trim() || "(none)";
  return `Analyze the following food. Images attached: ${imageCount}. Description: ${desc}.`;
}

// Dump raw model output + context to disk on parse failure so we can
// inspect it offline.
function dumpParseFailure({ userId, description, imageCount, text, err }) {
  try {
    const dir = path.join("uploads", "failed-parses");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `meal-${userId || "anon"}-${Date.now()}.txt`);
    fs.writeFileSync(
      file,
      [
        `# Failed meal parse @ ${new Date().toISOString()}`,
        `# userId: ${userId}`,
        `# imageCount: ${imageCount}`,
        `# description: ${description || "(none)"}`,
        `# error: ${err?.message} (code=${err?.code || "n/a"})`,
        `# rawLength: ${text?.length ?? 0}`,
        "",
        text || "(no response text captured)",
      ].join("\n")
    );
    return file;
  } catch (_) {
    return null;
  }
}

/**
 * POST /api/users/:userId/meals/analyze
 * multipart/form-data: images[] (0..5 files) + description (optional string)
 */
const analyzeMeal = async (req, res, next) => {
  try {
    const description = (req.body?.description || "").trim();
    const files = Array.isArray(req.files) ? req.files : [];

    if (files.length === 0 && !description) {
      return res.sendError("Provide an image or a description.", 400);
    }

    // Persist each uploaded image to pending/ first — if Claude blows up we
    // still rely on the orphan GC rather than trying to clean up on every
    // error path.
    const imageKeys = [];
    for (const f of files) {
      try {
        const key = mealStorage.save(f.buffer, f.mimetype);
        imageKeys.push(key);
      } catch (storageErr) {
        console.error(
          `[Meals] Failed to save pending image for user=${req.user.id}: ${storageErr.message}`
        );
        return res.sendError("Couldn't save your photos. Try again.", 500);
      }
    }

    // Build the vision content blocks: one per image + the user prompt text.
    const imageContents = files.map((f) => ({
      type: "image",
      source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") },
    }));
    const userPrompt = buildUserPrompt(description, files.length);

    let result;
    try {
      // parseVision() in providers/ai.js takes a single buffer today. For
      // single-image meals we reuse it directly to share the streaming path
      // with blood reports. For multi-image and text-only cases we bypass
      // parseVision and talk to the Anthropic streaming API ourselves —
      // same pattern (stream().finalMessage()), just different content.
      if (files.length > 1) {
        result = await parseVisionMultiImage({
          imageContents,
          description,
          maxTokens: MEAL_ANALYZE_MAX_TOKENS,
        });
      } else if (files.length === 1) {
        result = await parseVision({
          buffer: files[0].buffer,
          mimeType: files[0].mimetype,
          filename: f_safeName(files[0]),
          systemPrompt: mealParserSystemPrompt,
          userPrompt,
          maxTokens: MEAL_ANALYZE_MAX_TOKENS,
        });
      } else {
        // Text-only — parseVision requires an image today. We go direct.
        result = await parseVisionTextOnly({
          description,
          maxTokens: MEAL_ANALYZE_MAX_TOKENS,
        });
      }
    } catch (visionErr) {
      console.error(`[Meals] Vision call failed user=${req.user.id}: ${visionErr.message}`);
      return res.sendError("Couldn't analyze this meal. Try again in a moment.", 502);
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = extractJSON(result.text);
    } catch (parseErr) {
      const dump = dumpParseFailure({
        userId: req.user.id,
        description,
        imageCount: files.length,
        text: result.text,
        err: parseErr,
      });
      console.error(
        `[Meals] Parse failed user=${req.user.id} dump=${dump || "none"}: ${parseErr.message}`
      );
      return res.sendError(
        "Couldn't read the analysis. Try a clearer photo or simpler description.",
        502
      );
    }

    if (!parsed || typeof parsed !== "object" || !parsed.estimate) {
      return res.sendError(
        "Couldn't read the analysis. Try a clearer photo or simpler description.",
        502
      );
    }

    return res.sendSuccess(
      { estimate: parsed.estimate, imageKeys },
      "Meal analyzed"
    );
  } catch (error) {
    next(error);
  }
};

// Helpers shared by analyze path — kept at module scope so we don't redefine
// them per request.

function f_safeName(file) {
  return (file.originalname || "image").replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Multi-image call: we bypass parseVision's single-image signature and go
// straight to the Anthropic SDK's streaming messages API, matching the
// pattern already used in providers/ai.js.
async function parseVisionMultiImage({ imageContents, description, maxTokens }) {
  const Anthropic =
    require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const userPrompt = buildUserPrompt(description, imageContents.length);

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: mealParserSystemPrompt,
    messages: [
      {
        role: "user",
        content: [...imageContents, { type: "text", text: userPrompt }],
      },
    ],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content?.find((b) => b.type === "text");
  return {
    text: textBlock?.text || "",
    usage: {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0,
    },
    truncated: response.stop_reason === "max_tokens",
  };
}

// Text-only call: no images at all. Same streaming path.
async function parseVisionTextOnly({ description, maxTokens }) {
  const Anthropic =
    require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const userPrompt = buildUserPrompt(description, 0);

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: mealParserSystemPrompt,
    messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content?.find((b) => b.type === "text");
  return {
    text: textBlock?.text || "",
    usage: {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0,
    },
    truncated: response.stop_reason === "max_tokens",
  };
}

module.exports = { analyzeMeal };
```

- [ ] **Step 2: Smoke-test the controller loads**

```bash
node -e 'const c = require("./src/controllers/mealController"); console.log("exports:", Object.keys(c));'
```

Expected: `exports: [ 'analyzeMeal' ]`

The full end-to-end verification happens after Task 9 wires the route; don't try to curl this yet.

- [ ] **Step 3: Commit**

```bash
git add src/controllers/mealController.js
git commit -m "feat(meals): add analyzeMeal controller with multi-image + text-only paths"
```

---

## Task 6: commitMeal Handler

**Files:**
- Modify: `src/controllers/mealController.js`

- [ ] **Step 1: Add the commit handler**

Append to the bottom of `src/controllers/mealController.js`, **replacing** the existing `module.exports` line at the end of the file:

```js
// Derives a title from the first one or two items when the user leaves it blank.
function autoTitleFromItems(items) {
  const names = (items || []).map((i) => i?.name).filter(Boolean);
  if (names.length === 0) return "Meal";
  if (names.length === 1) return names[0];
  return `${names[0]}, ${names[1]}`;
}

/**
 * POST /api/users/:userId/meals
 * JSON body: { title?, consumedAt, totals, items, imageKeys, inputText? }
 */
const commitMeal = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { totals, items, imageKeys, inputText, confidence } = body;
    const title = (body.title || "").trim();
    const consumedAt = body.consumedAt ? new Date(body.consumedAt) : new Date();

    if (isNaN(consumedAt.getTime())) {
      return res.sendError("Invalid consumedAt timestamp.", 400);
    }
    if (!totals || typeof totals !== "object") {
      return res.sendError("totals is required.", 400);
    }
    if (!Array.isArray(items)) {
      return res.sendError("items must be an array.", 400);
    }
    if (imageKeys != null && !Array.isArray(imageKeys)) {
      return res.sendError("imageKeys must be an array of strings.", 400);
    }

    // Validate every provided imageKey is a pending/ key that actually exists.
    // We don't (yet) track per-user ownership tags on images in the local
    // driver — that check will gain teeth when R2 lifecycle tags arrive.
    const pendingKeys = imageKeys || [];
    for (const k of pendingKeys) {
      if (typeof k !== "string" || !k.includes("/pending/")) {
        return res.sendError("Invalid image reference.", 400);
      }
      const abs = mealStorage.pathFor(k);
      if (!abs || !fs.existsSync(abs)) {
        return res.sendError("Image not found — may have expired. Re-upload.", 400);
      }
    }

    // Promote each pending image to committed/.
    const committedKeys = [];
    try {
      for (const k of pendingKeys) {
        committedKeys.push(mealStorage.promote(k));
      }
    } catch (promoteErr) {
      console.error(`[Meals] Promote failed user=${req.user.id}: ${promoteErr.message}`);
      // Best effort cleanup: delete any images we already promoted in this
      // request so we don't leave a half-committed set.
      for (const k of committedKeys) mealStorage.remove(k);
      return res.sendError("Couldn't finalize meal. Try again.", 500);
    }

    const finalTitle = title || autoTitleFromItems(items);

    const meal = await Meal.create({
      userId: req.user.id,
      title: finalTitle,
      consumedAt,
      totals,
      items,
      imageKeys: committedKeys,
      inputText: inputText || null,
      confidence: confidence || null,
      modelUsed: getModelName(),
      tokensUsed: body.tokensUsed || { input: 0, output: 0 },
    });

    return res.sendSuccess(meal, "Meal saved", 201);
  } catch (error) {
    next(error);
  }
};

module.exports = { analyzeMeal, commitMeal };
```

- [ ] **Step 2: Verify the controller re-exports commitMeal**

```bash
node -e 'const c = require("./src/controllers/mealController"); console.log("exports:", Object.keys(c));'
```

Expected: `exports: [ 'analyzeMeal', 'commitMeal' ]`

- [ ] **Step 3: Commit**

```bash
git add src/controllers/mealController.js
git commit -m "feat(meals): add commitMeal handler with image promotion"
```

---

## Task 7: listMeals and getMealSummary

**Files:**
- Modify: `src/controllers/mealController.js`

- [ ] **Step 1: Add read handlers**

Append to `src/controllers/mealController.js` — again **replacing** the last `module.exports` line:

```js
// Parse a ?date=YYYY-MM-DD query param into the UTC day bounds.
// Returns null on invalid format.
function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * GET /api/users/:userId/meals?date=YYYY-MM-DD
 * Returns meals whose consumedAt falls within the UTC day, newest first.
 */
const listMeals = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }
    const meals = await Meal.find({
      userId: req.user.id,
      consumedAt: { $gte: bounds.start, $lt: bounds.end },
    })
      .sort({ consumedAt: -1, createdAt: -1 })
      .lean();
    return res.sendSuccess(meals, "Meals retrieved");
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:userId/meals/summary?date=YYYY-MM-DD
 * Aggregates totals and item count across all meals for that day.
 */
const getMealSummary = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const agg = await Meal.aggregate([
      {
        $match: {
          userId: userObjectId,
          consumedAt: { $gte: bounds.start, $lt: bounds.end },
        },
      },
      {
        $group: {
          _id: null,
          calories: { $sum: "$totals.calories" },
          proteinG: { $sum: "$totals.proteinG" },
          carbsG: { $sum: "$totals.carbsG" },
          fatG: { $sum: "$totals.fatG" },
          fiberG: { $sum: "$totals.fiberG" },
          sugarG: { $sum: "$totals.sugarG" },
          itemCount: { $sum: { $size: { $ifNull: ["$items", []] } } },
        },
      },
    ]);

    const totals = agg[0] || {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      itemCount: 0,
    };
    delete totals._id;

    return res.sendSuccess(totals, "Meal summary retrieved");
  } catch (error) {
    next(error);
  }
};

module.exports = { analyzeMeal, commitMeal, listMeals, getMealSummary };
```

- [ ] **Step 2: Verify exports**

```bash
node -e 'const c = require("./src/controllers/mealController"); console.log("exports:", Object.keys(c).sort());'
```

Expected: `exports: [ 'analyzeMeal', 'commitMeal', 'getMealSummary', 'listMeals' ]`

- [ ] **Step 3: Commit**

```bash
git add src/controllers/mealController.js
git commit -m "feat(meals): add listMeals + getMealSummary read endpoints"
```

---

## Task 8: updateMeal and deleteMeal

**Files:**
- Modify: `src/controllers/mealController.js`

- [ ] **Step 1: Add mutation handlers**

Append to `src/controllers/mealController.js` — **replacing** the last `module.exports` line again:

```js
const PATCHABLE_FIELDS = new Set([
  "title",
  "consumedAt",
  "totals",
  "items",
  "inputText",
]);

/**
 * PATCH /api/users/:userId/meals/:mealId
 * Partial update. imageKeys/userId/_id/modelUsed/tokensUsed are NOT patchable.
 */
const updateMeal = async (req, res, next) => {
  try {
    const body = req.body || {};
    const update = {};
    for (const key of Object.keys(body)) {
      if (!PATCHABLE_FIELDS.has(key)) continue;
      if (key === "consumedAt") {
        const d = new Date(body[key]);
        if (isNaN(d.getTime())) {
          return res.sendError("Invalid consumedAt timestamp.", 400);
        }
        update[key] = d;
      } else {
        update[key] = body[key];
      }
    }
    if (Object.keys(update).length === 0) {
      return res.sendError("No patchable fields provided.", 400);
    }

    const meal = await Meal.findOneAndUpdate(
      { _id: req.params.mealId, userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }
    return res.sendSuccess(meal, "Meal updated");
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:userId/meals/:mealId
 * Removes meal doc and best-effort deletes its stored images.
 */
const deleteMeal = async (req, res, next) => {
  try {
    const meal = await Meal.findOneAndDelete({
      _id: req.params.mealId,
      userId: req.user.id,
    });
    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }
    for (const key of meal.imageKeys || []) {
      mealStorage.remove(key);
    }
    return res.sendSuccess({ ok: true }, "Meal deleted");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeMeal,
  commitMeal,
  listMeals,
  getMealSummary,
  updateMeal,
  deleteMeal,
};
```

- [ ] **Step 2: Verify final exports**

```bash
node -e 'const c = require("./src/controllers/mealController"); console.log("exports:", Object.keys(c).sort());'
```

Expected: `exports: [ 'analyzeMeal', 'commitMeal', 'deleteMeal', 'getMealSummary', 'listMeals', 'updateMeal' ]`

- [ ] **Step 3: Commit**

```bash
git add src/controllers/mealController.js
git commit -m "feat(meals): add updateMeal + deleteMeal mutation endpoints"
```

---

## Task 9: Routes + Mount

**Files:**
- Create: `src/routes/mealRoutes.js`
- Modify: `src/app.js`

- [ ] **Step 1: Create the routes file**

Create `src/routes/mealRoutes.js`:

```js
const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const mealUpload = require("../config/mealUpload");
const mealController = require("../controllers/mealController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

// Multipart: up to 5 images as field name "images" + optional "description"
router.post(
  "/:userId/meals/analyze",
  mealUpload.array("images", 5),
  mealController.analyzeMeal
);

router.post("/:userId/meals", mealController.commitMeal);

router.get("/:userId/meals", mealController.listMeals);

router.get("/:userId/meals/summary", mealController.getMealSummary);

router.patch("/:userId/meals/:mealId", mealController.updateMeal);

router.delete("/:userId/meals/:mealId", mealController.deleteMeal);

module.exports = router;
```

- [ ] **Step 2: Mount the routes in `src/app.js`**

Find the line in `src/app.js` that looks like:

```js
const userRoutes = require("./routes/userRoutes");
```

Add directly after it:

```js
const mealRoutes = require("./routes/mealRoutes");
```

Find the line:

```js
app.use("/api/users", userRoutes);
```

Add directly after it:

```js
app.use("/api/users", mealRoutes);
```

Both routers mounted on the same prefix is fine — Express walks them in order and meal paths don't collide with user paths.

- [ ] **Step 3: End-to-end verification**

Re-use the JWT you minted earlier (or mint a fresh one if expired):

```bash
node -e '
require("dotenv").config({ quiet: true });
const jwt = require("jsonwebtoken");
const fs = require("fs");
const token = jwt.sign(
  { id: "69e019569e1b305a24ca82bc", email: "ateeb.shaikh@cyborg.men", userType: "user" },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);
fs.writeFileSync("/tmp/cyborg-jwt.txt", token);
console.error("ok");
'
```

**9a — text-only analyze:**

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS -X POST "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -F "description=grilled chicken breast with steamed broccoli and one cup white rice" \
  -w "\n---\nHTTP %{http_code} | %{time_total}s\n"
```

Expected: HTTP 200, `data.estimate.items` has 2–3 items, `data.estimate.notFood === false`, `data.imageKeys === []`.

**9b — empty request:**

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS -X POST "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 400, message `"Provide an image or a description."`.

**9c — commit:**

Take the `imageKeys` + `estimate` from 9a's response and fire:

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS -X POST "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": null,
    "consumedAt": "2026-04-16T12:24:00Z",
    "totals": { "calories": 520, "proteinG": 42, "carbsG": 55, "fatG": 14, "fiberG": 5, "sugarG": 2 },
    "items": [
      { "name": "Grilled chicken breast", "portion": {"quantity": 1, "unit": "serving", "grams": 150},
        "calories": 220, "proteinG": 35, "carbsG": 0, "fatG": 8, "fiberG": 0, "sugarG": 0 }
    ],
    "imageKeys": [],
    "inputText": "grilled chicken breast with steamed broccoli and one cup white rice"
  }' \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 201, `data._id` exists, `data.title` auto-generated from items, `data.consumedAt` is the supplied value.

**9d — list today's meals:**

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals?date=2026-04-16" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 200, `data` is an array containing the meal from 9c.

**9e — day summary:**

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals/summary?date=2026-04-16" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 200, `data.itemCount === 1`, `data.calories === 220` (since we only put one item in the commit above).

**9f — patch:**

Use the `_id` from 9c:

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS -X PATCH "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals/<MEAL_ID>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Lunch"}' \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 200, `data.title === "Lunch"`.

**9g — delete:**

```bash
TOKEN=$(cat /tmp/cyborg-jwt.txt); curl -sS -X DELETE "http://localhost:5001/api/users/69e019569e1b305a24ca82bc/meals/<MEAL_ID>" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\n---\nHTTP %{http_code}\n"
```

Expected: HTTP 200, `data.ok === true`. Re-fetch via `GET /meals?date=2026-04-16` → empty array.

- [ ] **Step 4: Commit**

```bash
git add src/routes/mealRoutes.js src/app.js
git commit -m "feat(meals): wire mealRoutes into the users prefix"
```

---

## Task 10: Orphan Image GC Script

**Files:**
- Create: `scripts/gcMealImages.js`

- [ ] **Step 1: Create the GC script**

Create `scripts/gcMealImages.js`:

```js
#!/usr/bin/env node
// Deletes pending/ meal images that are older than the TTL AND not
// referenced by any Meal document. Safe to run repeatedly. Once we swap
// to Cloudflare R2, this script is obsolete — R2 lifecycle rules handle
// the cleanup inside the bucket itself.

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Meal = require("../src/models/Meal");
const mealStorage = require("../src/utils/mealStorage");

const TTL_MS = Number(process.env.MEAL_PENDING_TTL_MS) || 24 * 60 * 60 * 1000;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const pendingDir = path.join(mealStorage.BASE_DIR, "pending");
  if (!fs.existsSync(pendingDir)) {
    console.log(`Nothing to do — ${pendingDir} does not exist.`);
    await mongoose.disconnect();
    return;
  }

  // Read DB references so we don't delete keys that snuck into a Meal doc
  // (shouldn't happen — meals store committed keys — but defensive).
  const referenced = new Set();
  const docs = await Meal.find({}, { imageKeys: 1 }).lean();
  for (const d of docs) {
    for (const k of d.imageKeys || []) referenced.add(k);
  }

  const files = fs.readdirSync(pendingDir);
  const now = Date.now();
  let removed = 0;
  let kept = 0;

  for (const name of files) {
    const abs = path.join(pendingDir, name);
    const stat = fs.statSync(abs);
    const ageMs = now - stat.mtimeMs;
    const key = `meal-images/pending/${name}`;

    if (referenced.has(key)) {
      kept++;
      continue;
    }
    if (ageMs < TTL_MS) {
      kept++;
      continue;
    }
    fs.unlinkSync(abs);
    removed++;
    console.log(`removed ${name} (age ${Math.round(ageMs / 1000)}s)`);
  }

  console.log(`Done. removed=${removed} kept=${kept}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("gcMealImages failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Make it executable and verify**

```bash
chmod +x scripts/gcMealImages.js
```

Run it against your current state:

```bash
node scripts/gcMealImages.js
```

Expected: prints `removed=0 kept=N` where N matches whatever's currently in `uploads/meal-images/pending/`. Nothing gets deleted because nothing is older than 24h yet.

To test the deletion path with a short TTL:

```bash
MEAL_PENDING_TTL_MS=1 node scripts/gcMealImages.js
```

Expected: removes any pending image that isn't referenced by a Meal doc. Verify with `ls uploads/meal-images/pending/` before and after.

- [ ] **Step 3: Commit**

```bash
git add scripts/gcMealImages.js
git commit -m "feat(meals): add pending-image GC script for dev"
```

---

## Wrap-up

After all 10 tasks are green, confirm the spec's manual checklist end-to-end:

- [ ] 1-image analyze → commit → appears in `GET /meals?date=today`.
- [ ] 3-image analyze + description → commit → all three images readable at their committed paths (use `ls uploads/meal-images/committed/` and verify key count matches `data.imageKeys.length`).
- [ ] Text-only commit: empty `imageKeys[]` saves cleanly.
- [ ] Empty request → 400.
- [ ] 11 MB image → 400 (multer limit).
- [ ] 6 images → 400 (multer limit).
- [ ] Delete meal → `GET /meals/:id` via list endpoint returns nothing for that id; files under `uploads/meal-images/committed/` for those keys are gone.
- [ ] `GET /meals/summary` returns correct aggregates after logging 3+ meals on one day.
- [ ] GC: upload via `/analyze`, don't commit, run `MEAL_PENDING_TTL_MS=1 node scripts/gcMealImages.js` → pending file deleted.

If everything's green, this feature is shippable.
