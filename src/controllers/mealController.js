const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Meal = require("../models/Meal");
const MealScore = require("../models/MealScore");
const mealStorage = require("../utils/mealStorage");
const {
  computeFoodScore,
  computeAndSaveScore,
} = require("../services/foodScoringEngine");
const { ensureGlucoseAnalysis } = require("../services/glucoseInsights");
const {
  ingredientStats,
  typicalFromEngine,
} = require("../services/foodInsights");
const { mealParserSystemPrompt } = require("../prompts/mealParser");
const { parseVision, extractJSON, getModelName, getAnthropicClient, getProvider } = require("../providers/ai");
const { analyzeMealAgentic } = require("../services/mealAnalyze");

const MEAL_ANALYZE_MAX_TOKENS =
  Number(process.env.CLAUDE_MEAL_MAX_TOKENS) || 8192;

// Agentic dataset-enrichment (lookup_food tool loop) is ON by default in this
// env; set USE_FOOD_DB_TOOL=false to force the legacy single-shot path. When ON,
// any agentic failure falls back to single-shot so the user never regresses.
// The loop is Anthropic-only (it drives the Claude tool API directly), so it
// stays off on a Gemini deployment rather than firing a guaranteed-failing
// Anthropic round-trip before falling back.
const USE_FOOD_DB_TOOL =
  process.env.USE_FOOD_DB_TOOL !== "false" && getProvider() === "claude";

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
    // error path. mealStorage.save is async now (uploads to R2).
    const imageKeys = [];
    for (const f of files) {
      try {
        const key = await mealStorage.save(f.buffer, f.mimetype, req.user.id);
        imageKeys.push(key);
      } catch (storageErr) {
        console.error(
          `[Meals] Failed to save pending image for user=${req.user.id}: ${storageErr.message}`
        );
        return res.sendError("Couldn't save your photos. Try again.", 500);
      }
    }

    const userPrompt = buildUserPrompt(description, files.length);

    let result;
    try {
      if (USE_FOOD_DB_TOOL) {
        // AGENTIC path: manual lookup_food tool loop that enriches macros from
        // the curated INDB/IFCT dataset. Wrapped so ANY failure (tool-loop
        // error, timeout, parse failure, cap exceeded with no final JSON)
        // falls back to the legacy single-shot path — the user never gets a
        // worse experience than today.
        try {
          const imageContents = files.map((f) => ({
            type: "image",
            source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") },
          }));
          result = await analyzeMealAgentic({
            imageContents,
            userPrompt,
            userId: req.user.id,
            maxTokens: MEAL_ANALYZE_MAX_TOKENS,
          });
        } catch (agenticErr) {
          console.warn(
            `[Meals] Agentic dataset-enrichment failed user=${req.user.id}; falling back to single-shot: ${agenticErr.message}`
          );
          result = await runSingleShot({
            files,
            description,
            userPrompt,
            maxTokens: MEAL_ANALYZE_MAX_TOKENS,
          });
        }
      } else {
        result = await runSingleShot({
          files,
          description,
          userPrompt,
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

// Legacy single-shot analyze path — the pre-agentic behavior, unchanged. Used
// directly when USE_FOOD_DB_TOOL is off, and as the fallback when the agentic
// loop fails. parseVision() (single image) shares blood-report's streaming
// path; multi-image and text-only go direct to the Anthropic streaming API.
async function runSingleShot({ files, description, userPrompt, maxTokens }) {
  if (files.length > 1) {
    // Build the vision content blocks only when we need them (multi-image path).
    const imageContents = files.map((f) => ({
      type: "image",
      source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") },
    }));
    return parseVisionMultiImage({ imageContents, description, maxTokens });
  }
  if (files.length === 1) {
    return parseVision({
      buffer: files[0].buffer,
      mimeType: files[0].mimetype,
      filename: f_safeName(files[0]),
      systemPrompt: mealParserSystemPrompt,
      userPrompt,
      maxTokens,
    });
  }
  // Text-only — parseVision requires an image today. We go direct.
  return parseVisionTextOnly({ description, maxTokens });
}

// Multi-image call: we bypass parseVision's single-image signature and go
// straight to the Anthropic SDK's streaming messages API, matching the
// pattern already used in providers/ai.js.
async function parseVisionMultiImage({ imageContents, description, maxTokens }) {
  const client = getAnthropicClient();
  const model = getModelName();
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
  const client = getAnthropicClient();
  const model = getModelName();
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

/**
 * Attach R2 public URLs for each imageKey so the frontend can render
 * <img src> directly. Null URLs are filtered out (e.g. when public
 * access isn't configured).
 */
function attachImageUrls(meal) {
  if (!meal) return meal;
  const keys = meal.imageKeys || [];
  const urls = keys
    .map((k) => mealStorage.publicUrlFor(k))
    .filter(Boolean);
  return { ...meal, imageUrls: urls };
}

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

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
    const mealType = body.mealType || null;
    if (mealType != null && !MEAL_TYPES.has(mealType)) {
      return res.sendError("mealType must be breakfast, lunch, dinner or snack.", 400);
    }

    // Validate every provided imageKey is a pending/ key that actually exists
    // in R2. Ownership is enforced by the userId segment in the key prefix
    // (the pending key embeds req.user.id at save() time).
    const pendingKeys = imageKeys || [];
    for (const k of pendingKeys) {
      if (typeof k !== "string" || !k.includes("/pending/")) {
        return res.sendError("Invalid image reference.", 400);
      }
      if (!k.includes(`/pending/${req.user.id}/`)) {
        return res.sendError("Invalid image reference.", 400);
      }
      const ok = await mealStorage.pathFor(k);
      if (!ok) {
        return res.sendError("Image not found — may have expired. Re-upload.", 400);
      }
    }

    // Promote each pending image to committed/ (R2 CopyObject + Delete).
    const committedKeys = [];
    try {
      for (const k of pendingKeys) {
        committedKeys.push(await mealStorage.promote(k));
      }
    } catch (promoteErr) {
      console.error(`[Meals] Promote failed user=${req.user.id}: ${promoteErr.message}`);
      // Best effort cleanup: delete any images we already promoted in this
      // request so we don't leave a half-committed set.
      for (const k of committedKeys) {
        // fire-and-forget
        mealStorage.remove(k).catch(() => {});
      }
      return res.sendError("Couldn't finalize meal. Try again.", 500);
    }

    const finalTitle = title || autoTitleFromItems(items);

    const meal = await Meal.create({
      userId: req.user.id,
      title: finalTitle,
      consumedAt,
      mealType,
      totals,
      items,
      imageKeys: committedKeys,
      inputText: inputText || null,
      confidence: confidence || null,
      modelUsed: getModelName(),
      tokensUsed: body.tokensUsed || { input: 0, output: 0 },
    });

    // Fire-and-forget: compute food score + glucose prediction in background
    computeAndSaveScore(meal).catch((err) =>
      console.error(
        `[FoodScore] Background score failed meal=${meal._id}: ${err.message}`
      )
    );

    return res.sendSuccess(attachImageUrls(meal.toObject()), "Meal saved", 201);
  } catch (error) {
    next(error);
  }
};

// Macro fields that must be numbers when present on a draft item / totals.
const NUMERIC_MACRO_FIELDS = [
  "grams",
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
];

// Returns the first macro key whose value is present but not a finite
// number, or null when the object is clean.
function firstInvalidMacro(obj) {
  for (const key of NUMERIC_MACRO_FIELDS) {
    const v = obj[key];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v))) {
      return key;
    }
  }
  return null;
}

// Same limit foodSearchController.itemInsight enforces on a single name.
const MAX_ITEM_NAME_LENGTH = 200;

// Draft item names are optional here (unlike itemInsight, where name is the
// whole request), but when present they must be strings — the scoring engine
// calls matchGI(item.name).toLowerCase() and would throw on anything else.
// Returns an error message, or null when the name is acceptable.
function invalidItemName(item) {
  const { name } = item;
  if (name == null) return null;
  if (typeof name !== "string") return "items.name must be a string.";
  if (name.length > MAX_ITEM_NAME_LENGTH) return "items.name too long.";
  return null;
}

/**
 * POST /api/users/:userId/meals/score-preview
 * JSON body: { items, totals } — draft-shaped, NOT persisted. Pure
 * deterministic engine score for the in-progress basket. No DB writes,
 * no AI.
 */
const scoreMealPreview = async (req, res, next) => {
  try {
    const { items, totals } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.sendError("items must be a non-empty array.", 400);
    }
    if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
      return res.sendError("totals is required.", 400);
    }
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return res.sendError("Each item must be an object.", 400);
      }
      const badName = invalidItemName(item);
      if (badName) {
        return res.sendError(badName, 400);
      }
      const bad = firstInvalidMacro(item);
      if (bad) {
        return res.sendError(`items.${bad} must be a number.`, 400);
      }
    }
    const badTotal = firstInvalidMacro(totals);
    if (badTotal) {
      return res.sendError(`totals.${badTotal} must be a number.`, 400);
    }

    const { score, factors } = computeFoodScore(items, totals);
    return res.sendSuccess(
      { foodScore: score, factors },
      "Score preview computed"
    );
  } catch (error) {
    next(error);
  }
};

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
 * GET /api/users/:userId/meals/history?days=14
 * Returns meals from the last N days (default 14, clamped to 1..90),
 * ordered newest first. The frontend groups them into Today / Yesterday /
 * date sections.
 */
const getMealHistory = async (req, res, next) => {
  try {
    const raw = parseInt(req.query.days, 10);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const meals = await Meal.find({
      userId: req.user.id,
      consumedAt: { $gte: since },
    })
      .sort({ consumedAt: -1, createdAt: -1 })
      .lean();
    return res.sendSuccess(
      { days, meals: meals.map(attachImageUrls) },
      "Meal history retrieved"
    );
  } catch (error) {
    next(error);
  }
};

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
    return res.sendSuccess(meals.map(attachImageUrls), "Meals retrieved");
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

/**
 * GET /api/users/:userId/meals/recent-items?limit=20
 * Distinct food items from the user's recent meals, most-frequently logged
 * first, deduped by (lowercased, trimmed) item name. The most recent
 * occurrence supplies the portion + macros, so re-adding matches what the
 * user last ate. Powers the "From your past logs" list.
 */
const getRecentItems = async (req, res, next) => {
  try {
    const raw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 20;
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const rows = await Meal.aggregate([
      { $match: { userId: userObjectId } },
      { $sort: { consumedAt: -1 } },
      // Bound the scan so a long meal history can't blow up the unwind.
      { $limit: 300 },
      { $unwind: "$items" },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$items.name" } } },
          item: { $first: "$items" },
          lastLoggedAt: { $first: "$consumedAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, lastLoggedAt: -1 } },
      { $limit: limit },
    ]);

    const items = rows.map((r) => ({
      ...r.item,
      count: r.count,
      lastLoggedAt: r.lastLoggedAt,
    }));
    return res.sendSuccess(items, "Recent items retrieved");
  } catch (error) {
    next(error);
  }
};

const PATCHABLE_FIELDS = new Set([
  "title",
  "consumedAt",
  "mealType",
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
      } else if (key === "mealType") {
        const mt = body[key] || null;
        if (mt != null && !MEAL_TYPES.has(mt)) {
          return res.sendError("mealType must be breakfast, lunch, dinner or snack.", 400);
        }
        update[key] = mt;
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
    return res.sendSuccess(attachImageUrls(meal.toObject()), "Meal updated");
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
    // Fire-and-forget deletes — client doesn't need to wait for R2 to ack.
    for (const key of meal.imageKeys || []) {
      mealStorage.remove(key).catch(() => {});
    }
    return res.sendSuccess({ ok: true }, "Meal deleted");
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:userId/meals/:mealId
 * Returns the meal if it belongs to the caller, 404 otherwise.
 */
const getMealById = async (req, res, next) => {
  try {
    const meal = await Meal.findOne({
      _id: req.params.mealId,
      userId: req.user.id,
    }).lean();
    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }
    return res.sendSuccess(attachImageUrls(meal), "Meal retrieved");
  } catch (error) {
    next(error);
  }
};

// ── Meal insights (Day Review) ──────────────────────────────────────
// ingredientStats + typicalFromEngine live in services/foodInsights so the
// food-search insight endpoint shares the exact same logic.

/**
 * GET /api/users/:userId/meals/:mealId/insights
 * Meal + score + AI spiker analysis + per-ingredient community stats,
 * powering the Day Review UI.
 */
const getMealInsights = async (req, res, next) => {
  try {
    const meal = await Meal.findOne({
      _id: req.params.mealId,
      userId: req.user.id,
    }).lean();
    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }

    let mealScore = await MealScore.findOne({
      userId: req.user.id,
      mealId: meal._id,
    }).lean();
    if (!mealScore) {
      // Same on-demand compute path as the score endpoint.
      await computeAndSaveScore(meal);
      mealScore = await MealScore.findOne({
        userId: req.user.id,
        mealId: meal._id,
      }).lean();
    }
    if (!mealScore) {
      return res.sendError("Couldn't score this meal. Try again.", 500);
    }

    // Unlike day-review, insights runs the spiker analysis for ANY score.
    const rawAnalysis = await ensureGlucoseAnalysis(meal, mealScore);
    let analysis = null;
    if (rawAnalysis) {
      const all = rawAnalysis.alternatives || [];
      const pick = ({ name, description, macros }) => ({
        name,
        description,
        macros,
      });
      analysis = {
        spiker: rawAnalysis.spiker || null,
        explanation: rawAnalysis.explanation || null,
        alternatives: all.filter((a) => a.type === "alternative").map(pick),
        blunters: all.filter((a) => a.type === "blunter").map(pick),
      };
    }

    // Distinct items by normalized name; the first occurrence supplies the
    // display name and the macros for the engine fallback.
    const distinct = new Map();
    for (const item of meal.items || []) {
      const norm = (item.name || "").toLowerCase().trim();
      if (!norm || distinct.has(norm)) continue;
      distinct.set(norm, item);
    }

    // Resolve the AI's spiker name to an actual meal item — the model may
    // paraphrase ("basmati rice" for "Mutton biryani"), so fall back to
    // containment, then token overlap.
    let spikerNorm = (rawAnalysis?.spiker || "").toLowerCase().trim() || null;
    if (spikerNorm && !distinct.has(spikerNorm)) {
      const spikerTokens = new Set(spikerNorm.split(/\s+/));
      let best = null;
      let bestOverlap = 0;
      for (const key of distinct.keys()) {
        if (key.includes(spikerNorm) || spikerNorm.includes(key)) {
          best = key;
          bestOverlap = Infinity;
          break;
        }
        const overlap = key
          .split(/\s+/)
          .filter((t) => spikerTokens.has(t)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = key;
        }
      }
      if (best && bestOverlap > 0) spikerNorm = best;
    }

    const ingredients = await Promise.all(
      [...distinct.entries()].map(async ([norm, item]) => {
        const stats = await ingredientStats(norm, {
          excludeUserId: req.user.id,
        });
        return {
          name: item.name,
          isSpiker: spikerNorm !== null && norm === spikerNorm,
          stats,
          typical: stats ? null : typicalFromEngine(item),
        };
      })
    );

    const prediction =
      typeof mealScore.predictedGlucosePeak?.deltaMgDl === "number"
        ? mealScore.predictedGlucosePeak
        : null;

    return res.sendSuccess(
      {
        meal: {
          id: meal._id,
          title: meal.title,
          consumedAt: meal.consumedAt,
          items: meal.items,
          totals: meal.totals,
        },
        score: {
          foodScore: mealScore.foodScore,
          predictedGlucosePeak: prediction,
          factors: mealScore.foodScoreFactors,
        },
        analysis,
        ingredients,
      },
      "Meal insights retrieved"
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeMeal,
  commitMeal,
  scoreMealPreview,
  listMeals,
  getMealHistory,
  getMealSummary,
  getRecentItems,
  getMealById,
  getMealInsights,
  updateMeal,
  deleteMeal,
};
