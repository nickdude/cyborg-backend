const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Meal = require("../models/Meal");
const mealStorage = require("../utils/mealStorage");
const { mealParserSystemPrompt } = require("../prompts/mealParser");
const { parseVision, extractJSON, getModelName, getAnthropicClient } = require("../providers/ai");

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

    const userPrompt = buildUserPrompt(description, files.length);

    let result;
    try {
      // parseVision() in providers/ai.js takes a single buffer today. For
      // single-image meals we reuse it directly to share the streaming path
      // with blood reports. For multi-image and text-only cases we bypass
      // parseVision and talk to the Anthropic streaming API ourselves —
      // same pattern (stream().finalMessage()), just different content.
      if (files.length > 1) {
        // Build the vision content blocks only when we need them (multi-image path).
        const imageContents = files.map((f) => ({
          type: "image",
          source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") },
        }));
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
