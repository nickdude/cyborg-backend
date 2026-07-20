/**
 * Agentic meal-analyze loop with dataset enrichment.
 *
 * Runs a MANUAL Anthropic tool-use loop (mirroring the shape/caps of
 * providers/ai.js streamChatClaude) so the model can call `lookup_food` per
 * recognized food and adopt curated INDB/IFCT macros where a candidate clearly
 * matches. Returns the SAME { text } shape as parseVision* so the controller's
 * existing extractJSON + estimate/contract handling stays unchanged.
 *
 * This path is gated + fully fallback-wrapped by the controller: any throw here
 * (tool-loop error, timeout, parse failure, cap exceeded with no final JSON)
 * makes the controller fall back to the legacy single-shot path.
 */
const { getAnthropicClient, getModelName, extractJSON } = require("../providers/ai");
const { mealParserSystemPrompt } = require("../prompts/mealParser");
const lookupFood = require("../tools/lookupFood");

// Food ID rarely needs many round-trips; a low iteration cap also bounds the
// image-rebill cost (base64 blocks re-send each turn) and keeps latency tight.
const MAX_TOOL_ITERATIONS = parseInt(process.env.MAX_TOOL_ITERATIONS || "4", 10);
const MAX_TOOL_CALLS = parseInt(process.env.MAX_TOOL_CALLS || "15", 10);
// Overall wall-clock budget for the whole loop; on exceed we throw -> fallback.
// Kept well under prod nginx's 60s proxy_read_timeout so that this budget PLUS
// the fallback single-shot vision call still finish before nginx 504s.
const AGENTIC_TIME_BUDGET_MS =
  Number(process.env.MEAL_AGENTIC_BUDGET_MS) || 30000;

// Appended to mealParserSystemPrompt only on the agentic path.
const AGENTIC_INSTRUCTIONS = `

DATASET ENRICHMENT (tool use):
You have a tool named "lookup_food" that searches a curated Indian nutrition dataset (INDB/IFCT).
For every food you identify, call lookup_food with its name (the "query" argument). You may issue several lookups in a single turn.
Each candidate returns per100g macros (calories, proteinG, carbsG, fatG, fiberG, sugarG), a defaultServing, and common servings.
If a returned candidate clearly matches the food, set that item's macros to the candidate's per100g scaled to your estimated grams:
  macros = per100g × grams / 100
and set that item's "source" to the candidate source (e.g. "indb" or "ifct").
If no candidate clearly matches (or the tool returns none), estimate the macros yourself and set that item's "source" to "ai".
Add "source" as an extra string field on each entry in "items[]"; keep every other field exactly as specified in the schema above, and keep "totals" equal to the sum of the item macros.
When you are finished looking up foods, STOP calling tools and return the final estimate as raw JSON in the SAME schema described above (with the added per-item "source" field). Do not wrap it in prose or markdown.`;

const MACRO_KEYS = ["calories", "proteinG", "carbsG", "fatG", "fiberG", "sugarG"];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Default per-item source + recompute totals from the final items so they can
// never drift from what the model set per-item. Mutates + returns estimate.
function normalizeEstimate(estimate) {
  const items = Array.isArray(estimate.items) ? estimate.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.source !== "string" || !item.source.trim()) {
      item.source = "ai";
    }
  }
  const totals = {};
  for (const k of MACRO_KEYS) {
    let sum = 0;
    for (const item of items) sum += num(item && item[k]);
    totals[k] = k === "calories" ? Math.round(sum) : Math.round(sum * 10) / 10;
  }
  // Overwrite only the six schema macro fields; preserve any others verbatim.
  estimate.totals = { ...(estimate.totals || {}), ...totals };
  return estimate;
}

/**
 * @param {Object}  opts
 * @param {Array}   opts.imageContents - Claude image content blocks (0..5)
 * @param {string}  opts.userPrompt    - the same user text the single-shot path builds
 * @param {string}  opts.userId        - for lookupFood.execute(input, userId)
 * @param {number}  opts.maxTokens
 * @returns {{ text: string, usage: {input,output}, truncated: boolean, agentic: true }}
 */
async function analyzeMealAgentic({ imageContents = [], userPrompt, userId, maxTokens }) {
  const client = getAnthropicClient();
  const model = getModelName();
  const deadline = Date.now() + AGENTIC_TIME_BUDGET_MS;

  const system = mealParserSystemPrompt + AGENTIC_INSTRUCTIONS;
  const userContent = [...imageContents, { type: "text", text: userPrompt }];
  let messages = [{ role: "user", content: userContent }];

  let iteration = 0;
  let toolCallCount = 0;
  const usage = { input: 0, output: 0 };
  let truncated = false;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`agentic time budget exceeded (${AGENTIC_TIME_BUDGET_MS}ms)`);
    }
    iteration++;
    if (iteration > MAX_TOOL_ITERATIONS) {
      throw new Error(`agentic iteration cap (${MAX_TOOL_ITERATIONS}) reached without final JSON`);
    }
    if (toolCallCount > MAX_TOOL_CALLS) {
      throw new Error(`agentic tool-call cap (${MAX_TOOL_CALLS}) reached without final JSON`);
    }

    // Hard per-request timeout so the SDK call itself can't outlive the budget.
    const remaining = deadline - Date.now();
    console.log(
      `[MealAgentic] -> request #${iteration} | model: ${model} | tools_used: ${toolCallCount} | msgs: ${messages.length}`
    );
    const response = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        tools: [lookupFood.definition],
        messages,
      },
      { timeout: Math.max(1000, remaining) }
    );

    usage.input += response.usage?.input_tokens || 0;
    usage.output += response.usage?.output_tokens || 0;
    if (response.stop_reason === "max_tokens") truncated = true;
    console.log(
      `[MealAgentic] <- response #${iteration} | stop: ${response.stop_reason} | in: ${response.usage?.input_tokens} | out: ${response.usage?.output_tokens}`
    );

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults = [];
      for (const block of toolUseBlocks) {
        toolCallCount++;
        let result;
        if (block.name === lookupFood.definition.name) {
          result = await lookupFood.execute(block.input || {}, userId);
        } else {
          result = { error: `Unknown tool: ${block.name}` };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
      continue;
    }

    // Any non-tool_use stop (end_turn / max_tokens / stop_sequence): this is the
    // final message. Extract + validate the estimate JSON.
    const textBlock = response.content?.find((b) => b.type === "text");
    const text = textBlock?.text || "";
    if (!text) {
      throw new Error(`agentic final message had no text block (stop_reason=${response.stop_reason})`);
    }

    const parsed = extractJSON(text); // may throw -> controller falls back
    if (!parsed || typeof parsed !== "object" || !parsed.estimate) {
      throw new Error("agentic final JSON missing estimate");
    }
    normalizeEstimate(parsed.estimate);

    return {
      // Re-serialize so the controller's existing extractJSON(result.text) path
      // is byte-for-byte the same as the single-shot path.
      text: JSON.stringify(parsed),
      usage,
      truncated,
      agentic: true,
    };
  }
}

module.exports = { analyzeMealAgentic };
