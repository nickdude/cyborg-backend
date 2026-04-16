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

module.exports = { analyzeMeal };
