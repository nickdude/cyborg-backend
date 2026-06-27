/**
 * AI Provider Abstraction
 *
 * Exposes a unified interface for both Claude and Gemini.
 * Controlled by AI_PROVIDER env var ("claude" | "gemini").
 *
 * Exports:
 *   - getProvider()        -> "claude" | "gemini"
 *   - getModelName()       -> current model string
 *   - streamChat(opts)     -> agentic loop streaming (for chat.js)
 *   - parseVision(opts)    -> vision-based extraction (for reports/agent)
 *   - convertToolsForProvider(claudeTools) -> convert tool defs
 */

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
const { GoogleGenerativeAI, FunctionCallingMode } = require("@google/generative-ai");

// --- Provider detection (lazy -- env may not be loaded at import time) -------

let _provider = null;
function getProvider() {
  if (_provider === null) {
    _provider = (process.env.AI_PROVIDER || "claude").toLowerCase();
    console.log(`[AI] Provider resolved: ${_provider}`);
  }
  return _provider;
}

function getModelName() {
  return getProvider() === "gemini"
    ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
    : process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
}

// --- Gemini key management (primary + fallback) -----------------------------

let _primaryGeminiKey = null;
let _fallbackGeminiKeys = null;
let _fallbackIndex = 0;

function loadGeminiKeys() {
  if (_primaryGeminiKey !== null || _fallbackGeminiKeys !== null) return;
  _fallbackGeminiKeys = [];
  _primaryGeminiKey = process.env.GEMINI_API_KEY_primary || null;
  for (let i = 1; i <= 20; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key) _fallbackGeminiKeys.push(key);
  }
  const total = (_primaryGeminiKey ? 1 : 0) + _fallbackGeminiKeys.length;
  console.log(`[AI] Loaded ${total} Gemini API keys (1 primary, ${_fallbackGeminiKeys.length} fallback)`);
}

function getPrimaryGeminiKey() {
  loadGeminiKeys();
  if (!_primaryGeminiKey && _fallbackGeminiKeys.length === 0)
    throw new Error("No GEMINI_API_KEY_* found in .env");
  return _primaryGeminiKey;
}

function getNextFallbackKey() {
  loadGeminiKeys();
  if (_fallbackGeminiKeys.length === 0) return _primaryGeminiKey;
  const key = _fallbackGeminiKeys[_fallbackIndex % _fallbackGeminiKeys.length];
  _fallbackIndex++;
  return key;
}

function getGeminiClient(fallback = false) {
  const key = fallback ? getNextFallbackKey() : getPrimaryGeminiKey();
  if (!key) throw new Error("No Gemini API key available");
  return new GoogleGenerativeAI(key);
}

function isGeminiKeyError(err) {
  const code = err?.status || err?.statusCode || err?.code;
  if (code === 429 || code === 403) return true;
  const msg = (err?.message || "").toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted");
}

// --- Retry helpers ----------------------------------------------------------

const OVERLOAD_DELAYS_MS = [1000, 2000, 4000]; // ~7s total max wait

function isOverloadedError(err) {
  if (err?.status === 529 || err?.statusCode === 529) return true;
  if (err?.error?.type === "overloaded_error") return true;
  return (err?.message || "").toLowerCase().includes("overloaded");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Claude client ----------------------------------------------------------

let _anthropic;
function getAnthropicClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// --- Tool format conversion -------------------------------------------------

/**
 * Convert Claude tool definitions to Gemini function declarations.
 * Claude format:  { name, description, input_schema: { type, properties, required } }
 * Gemini format:  { name, description, parameters: { type, properties, required } }
 */
function convertToolsForGemini(claudeTools) {
  return claudeTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchemaForGemini(tool.input_schema),
  }));
}

/**
 * Gemini doesn't support a top-level 'default' or certain JSON Schema keywords.
 * Recursively clean the schema for Gemini compatibility.
 */
function sanitizeSchemaForGemini(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const cleaned = {};
  for (const [key, val] of Object.entries(schema)) {
    if (key === "default") continue; // Gemini rejects 'default'
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      cleaned[key] = sanitizeSchemaForGemini(val);
    } else if (Array.isArray(val)) {
      cleaned[key] = val.map((v) =>
        typeof v === "object" && v !== null ? sanitizeSchemaForGemini(v) : v
      );
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

// --- Chat Streaming ---------------------------------------------------------

/**
 * Run the agentic chat loop.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages        - Conversation in Claude format [{role, content}]
 * @param {string} opts.systemPrompt    - System prompt string
 * @param {Array}  opts.tools           - Claude-format tool definitions
 * @param {Function} opts.executeTool   - async (name, input) => result
 * @param {Function} opts.emit          - SSE emitter (data) => void
 * @param {boolean}  opts.enableThinking
 * @param {number}   opts.thinkingBudget
 * @returns {{ text, toolUses, thinking }}
 */
async function streamChat(opts) {
  return getProvider() === "gemini"
    ? streamChatGemini(opts)
    : streamChatClaude(opts);
}

// -- Claude implementation ---------------------------------------------------

async function streamChatClaude({
  messages, systemPrompt, tools, executeTool, emit,
  enableThinking = false, thinkingBudget = 8000,
}) {
  const anthropic = getAnthropicClient();
  const model = getModelName();
  let currentMessages = [...messages];
  let allToolUses = [];
  let thinkingMap = {};   // { [toolIndex]: string } -- thinking segmented by tool slot
  let toolCallCount = 0;  // increments after each batch of tool calls
  let thinkingEnabled = enableThinking;
  let iteration = 0;
  let overloadRetries = 0;

  const MAX_ITERATIONS = parseInt(process.env.MAX_TOOL_ITERATIONS || "12", 10);
  const MAX_TOOL_CALLS = parseInt(process.env.MAX_TOOL_CALLS || "25", 10);

  while (true) {
    iteration++;
    if (iteration > MAX_ITERATIONS) {
      console.warn(`[Claude] iteration cap (${MAX_ITERATIONS}) reached; aborting loop`);
      emit({ type: "error", message: "Assistant reached maximum reasoning steps. Try a simpler question." });
      return { text: "", toolUses: allToolUses, thinkingMap: Object.keys(thinkingMap).length ? thinkingMap : null };
    }
    if (allToolUses.length > MAX_TOOL_CALLS) {
      console.warn(`[Claude] tool-call cap (${MAX_TOOL_CALLS}) reached; aborting loop`);
      emit({ type: "error", message: "Assistant reached maximum tool calls. Try a simpler question." });
      return { text: "", toolUses: allToolUses, thinkingMap: Object.keys(thinkingMap).length ? thinkingMap : null };
    }
    console.log(`[Claude] -> request #${iteration} | model: ${model} | thinking: ${thinkingEnabled} | messages: ${currentMessages.length}`);

    let accText = "";
    // Current segment index: toolCallCount - 1
    // (-1 = pre-first-tool, 0 = after tool[0], 1 = after tool[1], ...)
    const segmentIndex = toolCallCount - 1;

    try {
      const baseParams = {
        model,
        max_tokens: thinkingEnabled ? Math.max(16000, thinkingBudget + 4096) : 4096,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      };

      const stream = thinkingEnabled
        ? anthropic.beta.messages.stream({
            betas: ["interleaved-thinking-2025-05-14"],
            thinking: { type: "enabled", budget_tokens: thinkingBudget },
            ...baseParams,
          })
        : anthropic.messages.stream(baseParams);

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            // Accumulate into the correct segment
            thinkingMap[segmentIndex] = (thinkingMap[segmentIndex] || "") + event.delta.thinking;
            emit({ type: "thinkingDelta", text: event.delta.thinking, toolIndex: segmentIndex });
          } else if (event.delta.type === "text_delta") {
            accText += event.delta.text;
            emit({ type: "textDelta", text: event.delta.text });
          }
        }
      }

      const finalMsg = await stream.finalMessage();
      console.log(`[Claude] <- response #${iteration} | stop_reason: ${finalMsg.stop_reason} | in: ${finalMsg.usage?.input_tokens} | out: ${finalMsg.usage?.output_tokens}`);

      const hasThinking = Object.keys(thinkingMap).length > 0;

      if (finalMsg.stop_reason === "end_turn") {
        emit({ type: "done", toolUses: allToolUses, thinkingMap: hasThinking ? thinkingMap : null });
        return { text: accText, toolUses: allToolUses, thinkingMap: hasThinking ? thinkingMap : null };
      }

      if (finalMsg.stop_reason === "tool_use") {
        const toolUseBlocks = finalMsg.content.filter((b) => b.type === "tool_use");
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          emit({ type: "toolStart", name: toolUse.name, input: toolUse.input });
          const result = await executeTool(toolUse.name, toolUse.input);
          emit({ type: "toolEnd", name: toolUse.name, ok: !result.error, result });
          allToolUses.push({ name: toolUse.name, input: toolUse.input, result });
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
        }

        // Advance toolCallCount so next iteration's thinking gets a new segment index
        toolCallCount += toolUseBlocks.length;

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: finalMsg.content },
          { role: "user", content: toolResults },
        ];
        overloadRetries = 0;
        continue;
      }

      emit({ type: "done", toolUses: allToolUses, thinkingMap: hasThinking ? thinkingMap : null });
      return { text: accText, toolUses: allToolUses, thinkingMap: hasThinking ? thinkingMap : null };

    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const status = err?.status || err?.statusCode;

      // Thinking unsupported -- disable and retry same turn
      if (thinkingEnabled && status === 400 && (msg.includes("thinking") || msg.includes("budget_tokens") || msg.includes("interleaved"))) {
        console.warn(`[Claude] Extended thinking not supported by model "${model}", falling back`);
        thinkingEnabled = false;
        emit({ type: "thinkingUnsupported" });
        iteration--;
        continue;
      }

      // Overloaded -- exponential backoff retry
      if (isOverloadedError(err) && overloadRetries < OVERLOAD_DELAYS_MS.length) {
        const delay = OVERLOAD_DELAYS_MS[overloadRetries];
        console.warn(`[Claude] Overloaded -- retry ${overloadRetries + 1}/${OVERLOAD_DELAYS_MS.length} in ${delay}ms`);
        await sleep(delay);
        overloadRetries++;
        iteration--;  // don't count this as a new logical turn
        continue;
      }

      throw err;
    }
  }
}

// -- Gemini implementation ---------------------------------------------------

async function streamChatGemini({
  messages, systemPrompt, tools, executeTool, emit,
}) {
  try {
    return await _streamChatGemini({ messages, systemPrompt, tools, executeTool, emit, useFallback: false });
  } catch (err) {
    if (isGeminiKeyError(err)) {
      console.warn("[Gemini Chat] Primary key quota/rate error, retrying with fallback key");
      return await _streamChatGemini({ messages, systemPrompt, tools, executeTool, emit, useFallback: true });
    }
    throw err;
  }
}

async function _streamChatGemini({
  messages, systemPrompt, tools, executeTool, emit, useFallback = false,
}) {
  const genAI = getGeminiClient(useFallback);
  const model = getModelName();
  let allToolUses = [];
  let iteration = 0;

  const MAX_ITERATIONS = parseInt(process.env.MAX_TOOL_ITERATIONS || "12", 10);
  const MAX_TOOL_CALLS = parseInt(process.env.MAX_TOOL_CALLS || "25", 10);

  // Convert tools to Gemini format
  const geminiTools = [{
    functionDeclarations: convertToolsForGemini(tools),
  }];

  // Build Gemini chat history from Claude-format messages
  // Claude: [{role: 'user'|'assistant', content: string}]
  // Gemini: [{role: 'user'|'model', parts: [{text}]}]
  const history = [];
  for (const msg of messages.slice(0, -1)) {
    history.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
    });
  }

  const lastUserMsg = messages[messages.length - 1];
  const userText = typeof lastUserMsg.content === "string"
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg.content);

  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: geminiTools,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const chat = genModel.startChat({ history });

  // Agentic loop -- keep calling until no more tool calls
  let currentInput = userText;

  while (true) {
    iteration++;
    if (iteration > MAX_ITERATIONS) {
      console.warn(`[Gemini] iteration cap (${MAX_ITERATIONS}) reached; aborting loop`);
      emit({ type: "error", message: "Assistant reached maximum reasoning steps. Try a simpler question." });
      return { text: "", toolUses: allToolUses, thinkingMap: null };
    }
    if (allToolUses.length > MAX_TOOL_CALLS) {
      console.warn(`[Gemini] tool-call cap (${MAX_TOOL_CALLS}) reached; aborting loop`);
      emit({ type: "error", message: "Assistant reached maximum tool calls. Try a simpler question." });
      return { text: "", toolUses: allToolUses, thinkingMap: null };
    }
    console.log(`[Gemini] -> request #${iteration} | model: ${model} | messages: ${messages.length}`);

    const result = await chat.sendMessageStream(currentInput);

    let accText = "";
    let pendingFunctionCalls = [];

    for await (const chunk of result.stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          accText += part.text;
          emit({ type: "textDelta", text: part.text });
        }
        if (part.functionCall) {
          pendingFunctionCalls.push(part.functionCall);
        }
      }
    }

    // If no function calls, we're done
    if (pendingFunctionCalls.length === 0) {
      emit({ type: "done", toolUses: allToolUses, thinkingMap: null });
      return { text: accText, toolUses: allToolUses, thinkingMap: null };
    }

    // Execute tool calls
    const functionResponses = [];
    for (const fc of pendingFunctionCalls) {
      console.log(`[Gemini] tool_call: ${fc.name} | input: ${JSON.stringify(fc.args)}`);
      emit({ type: "toolStart", name: fc.name, input: fc.args });

      const result = await executeTool(fc.name, fc.args || {});

      console.log(`[Gemini] tool_result: ${fc.name} | ok: ${!result.error}`);
      emit({ type: "toolEnd", name: fc.name, ok: !result.error, result });

      allToolUses.push({ name: fc.name, input: fc.args, result });
      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: result,
        },
      });
    }

    // Send function responses back and continue the loop
    currentInput = functionResponses;
  }
}

// --- Vision / Document Parsing ----------------------------------------------

/**
 * Parse a document/image with vision.
 *
 * @param {Object} opts
 * @param {Buffer} opts.buffer       - File buffer
 * @param {string} opts.mimeType     - MIME type
 * @param {string} opts.filename     - Filename
 * @param {string} opts.systemPrompt - System prompt
 * @param {string} opts.userPrompt   - User prompt text
 * @returns {{ parsedData, usage: { input, output } }}
 */
async function parseVision(opts) {
  return getProvider() === "gemini"
    ? parseVisionGemini(opts)
    : parseVisionClaude(opts);
}

async function parseVisionClaude({ buffer, mimeType, filename, systemPrompt, userPrompt, maxTokens }) {
  const anthropic = getAnthropicClient();
  const model = getModelName();
  const outputCap = maxTokens || Number(process.env.CLAUDE_VISION_MAX_TOKENS) || 32768;

  let content;
  if (mimeType === "application/pdf") {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
      { type: "text", text: userPrompt },
    ];
  } else {
    content = [
      { type: "image", source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") } },
      { type: "text", text: userPrompt },
    ];
  }

  console.log(`[Claude Vision] -> model: ${model} | type: ${mimeType} | file: ${filename} | max_tokens: ${outputCap} | streaming`);

  // The Anthropic SDK refuses non-streaming requests when max_tokens is
  // high enough that the call could exceed a 10-minute HTTP deadline.
  // Using .stream(...).finalMessage() returns the same Message shape as
  // .create(...) but over a long-lived streaming connection.
  const stream = anthropic.messages.stream({
    model,
    max_tokens: outputCap,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();

  const stopReason = response.stop_reason;
  console.log(`[Claude Vision] <- stop: ${stopReason} | in: ${response.usage?.input_tokens} | out: ${response.usage?.output_tokens}`);

  if (stopReason === "max_tokens") {
    console.warn("[Claude Vision] Response truncated at max_tokens -- extracted JSON will be incomplete");
  }

  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error(`Claude Vision returned no text block. stop_reason: ${stopReason}, blocks: ${response.content?.length ?? 0}`);
  }

  return {
    text: textBlock.text,
    truncated: stopReason === "max_tokens",
    usage: { input: response.usage?.input_tokens || 0, output: response.usage?.output_tokens || 0 },
  };
}

async function parseVisionGemini(opts) {
  try {
    return await _parseVisionGemini({ ...opts, useFallback: false });
  } catch (err) {
    if (isGeminiKeyError(err)) {
      console.warn("[Gemini Vision] Primary key quota/rate error, retrying with fallback key");
      return await _parseVisionGemini({ ...opts, useFallback: true });
    }
    throw err;
  }
}

async function _parseVisionGemini({ buffer, mimeType, filename, systemPrompt, userPrompt, maxTokens, useFallback = false }) {
  const genAI = getGeminiClient(useFallback);
  const model = getModelName();
  const outputCap = maxTokens || Number(process.env.GEMINI_VISION_MAX_TOKENS) || 32768;

  console.log(`[Gemini Vision] -> model: ${model} | type: ${mimeType} | file: ${filename} | max_tokens: ${outputCap} | fallback: ${useFallback}`);

  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: outputCap },
  });

  const parts = [
    {
      inlineData: {
        mimeType,
        data: buffer.toString("base64"),
      },
    },
    { text: userPrompt },
  ];

  const result = await genModel.generateContent(parts);
  const response = result.response;
  const text = response.text();

  const usage = response.usageMetadata || {};
  const finishReason = response.candidates?.[0]?.finishReason;
  console.log(`[Gemini Vision] <- finish: ${finishReason} | in: ${usage.promptTokenCount || "?"} | out: ${usage.candidatesTokenCount || "?"}`);

  if (finishReason === "MAX_TOKENS") {
    console.warn("[Gemini Vision] Response truncated at MAX_TOKENS -- extracted JSON will be incomplete");
  }

  return {
    text,
    truncated: finishReason === "MAX_TOKENS",
    usage: {
      input: usage.promptTokenCount || 0,
      output: usage.candidatesTokenCount || 0,
    },
  };
}

// --- Non-streaming text generation -----------------------------------------

/**
 * Generate a text response (non-streaming, no tool use).
 * Used for tasks that need a complete response like JSON generation.
 *
 * @param {Object} opts
 * @param {string} opts.systemPrompt - System prompt
 * @param {string} opts.userPrompt - User message
 * @param {number} [opts.maxTokens=4096] - Max output tokens
 * @param {number} [opts.temperature] - Sampling temperature (0-1). When omitted,
 *   the provider's default temperature is used (unchanged legacy behavior).
 * @returns {Promise<string>} The generated text
 */
async function generateText({ systemPrompt, userPrompt, maxTokens = 4096, temperature }) {
  const provider = getProvider();
  const model = getModelName();

  if (provider === "gemini") {
    const runGeminiText = async (useFallback) => {
      const genAI = getGeminiClient(useFallback);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        // Only set generationConfig when a temperature is provided, so existing
        // callers keep the provider default.
        ...(temperature !== undefined && { generationConfig: { temperature } }),
      });
      console.log(`[Gemini Text] -> model: ${model} | fallback: ${useFallback} | temp: ${temperature ?? "default"}`);
      const result = await genModel.generateContent(userPrompt);
      const text = result.response.text();
      const usage = result.response.usageMetadata || {};
      console.log(`[Gemini Text] <- in: ${usage.promptTokenCount || "?"} | out: ${usage.candidatesTokenCount || "?"}`);
      return text;
    };
    try {
      return await runGeminiText(false);
    } catch (err) {
      if (isGeminiKeyError(err)) {
        console.warn("[Gemini Text] Primary key quota/rate error, retrying with fallback key");
        return await runGeminiText(true);
      }
      throw err;
    }
  }

  // Claude
  const anthropic = getAnthropicClient();
  console.log(`[Claude Text] -> model: ${model} | temp: ${temperature ?? "default"}`);

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    // Only pass temperature when provided, so existing callers keep the
    // provider default.
    ...(temperature !== undefined && { temperature }),
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content?.find((b) => b.type === "text");
  console.log(`[Claude Text] <- stop: ${response.stop_reason} | in: ${response.usage?.input_tokens} | out: ${response.usage?.output_tokens}`);
  return textBlock?.text || "";
}

// --- Helper: extract JSON from LLM response --------------------------------

// Best-effort repair of JSON that was cut off mid-output (LLM hit max_tokens).
// Walks the text tracking bracket depth + string state, remembers the last
// position where a container closed cleanly, then truncates there and
// re-closes any still-open outer containers.
function repairTruncatedJSON(text) {
  const firstBrace = text.search(/[\{\[]/);
  if (firstBrace === -1) return null;

  const stack = []; // expected closers, LIFO
  let inString = false;
  let escape = false;
  let lastSafeIdx = -1;
  let lastSafeStack = null;

  for (let i = firstBrace; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      if (stack.length && stack[stack.length - 1] === c) {
        stack.pop();
        lastSafeIdx = i;
        lastSafeStack = stack.slice();
      } else {
        break; // mismatched close — structure is corrupt before this point
      }
    }
    // NOTE: we intentionally only mark safe points at container closes.
    // String-close is NOT safe because the string may be a key (e.g.
    // `{"name"` truncated at end-of-key), and closing there produces
    // invalid JSON like `{"name"}`. Container closes are always safe.
  }

  if (lastSafeIdx === -1) return null;
  const prefix = text.slice(firstBrace, lastSafeIdx + 1);
  const closers = lastSafeStack.slice().reverse().join("");
  try { return JSON.parse(prefix + closers); } catch (_) { return null; }
}

function extractJSON(text) {
  // Try markdown code block first
  let match = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.warn("[extractJSON] Markdown block parse failed:", e.message);
    }
  }

  // Try to find JSON object in the text by finding matching braces
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = text.slice(start, end + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn("[extractJSON] Direct JSON parse failed:", e.message);
    }
  }

  // Fallback: try parsing the entire text
  try {
    return JSON.parse(text);
  } catch (_) { /* fall through to repair */ }

  // Last resort: treat as truncated and close any open structures
  const repaired = repairTruncatedJSON(text);
  if (repaired) {
    console.warn(`[extractJSON] Recovered via truncation repair (original length: ${text.length})`);
    return repaired;
  }

  const err = new Error("LLM response could not be parsed as JSON");
  err.code = "LLM_JSON_PARSE_FAILED";
  err.rawLength = text.length;
  err.rawSnippet = text.slice(0, 500);
  throw err;
}

module.exports = {
  getAnthropicClient,
  getProvider,
  getModelName,
  streamChat,
  parseVision,
  generateText,
  convertToolsForGemini,
  extractJSON,
};
