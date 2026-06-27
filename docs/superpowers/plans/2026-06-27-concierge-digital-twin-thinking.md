# Concierge Digital-Twin Chained Thinking — Implementation Plan (v2, post-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cyborg concierge feel like a live "digital twin / second brain" by rendering a Claude-Code-style chained reasoning timeline — a narrated `reason → tool → reason → tool → answer` stream — in **both** the user concierge and the doctor/patient view.

**Architecture:** A provider-independent **narration layer** is the always-on backbone: the backend emits a new `narration` SSE event around each `toolStart`/`toolEnd`, generated deterministically from a per-tool registry. The frontend renders **one unified step row per tool** (narration line + live pulse + takeaway + collapsible raw I/O + expandable real reasoning). Claude's real extended thinking enriches each step, looked up by **segment index**. The duplicated doctor chat is unified onto shared components first so every change lands once.

**Tech Stack:** Node/Express + Anthropic/Gemini SDKs (`src/providers/ai.js`), Next.js + Zustand + Tailwind (`src/stores/concierge.js`, `src/components/concierge/*`). SSE over `fetch` ReadableStream (`src/services/sse.js`).

**Decisions locked:** narration + real thinking; unify the doctor fork first; doctor experience stays on the patient page.

**Testing note:** No automated test framework exists (CLAUDE.md). Verification uses `node scripts/*.js` smoke harnesses, running the dev servers + observing the SSE stream/UI, and `curl` of the SSE endpoint. Each task gives a concrete, runnable check.

---

## ⚠️ Index Contract (read before touching ai.js / the reducer / the renderer)

Two **different** index spaces coexist — conflating them is the #1 bug the review caught:

- **`segmentIndex`** = `toolCallCount - 1` (ai.js:195), computed **before** a tool batch. All thinking streamed in that model turn accumulates into `thinkingMap[segmentIndex]`; **every tool in the same batch shares one `segmentIndex`**. `toolCallCount` is incremented by the batch size **after** the loop (ai.js:250). The reasoning *before the first tool* is segment `-1`; the reasoning *after the last tool, before the answer* is the highest segment and has **no tool**.
- **`toolIndex`** = `toolCallCount + bi` — a **globally unique, monotonic per-tool ordinal** (0,1,2,…). Used to pair `toolStart`/`toolEnd`/`narration(start|end)` for the same tool.

**Rules:** every `narration` event carries BOTH `toolIndex` (unique, for pairing) and `segmentIndex` (shared, for thinking lookup). The renderer attaches real thinking via `thinkingBySegment[block.segmentIndex]`, NOT `toolIndex`. The highest-keyed thinking segment (no tool) is rendered as a closing "reasoned before answering" row above the answer.

---

## File Structure

**Backend (`cyborg-backend`)**
- Create `src/services/toolNarration.js` — pure registry: `narrateStart(name,input,persona)`, `narrateEnd(name,result)`.
- Modify `src/providers/ai.js` — emit `narration` (+ `segmentIndex`/`toolIndex` on tool events) in **both** `streamChatClaude` and `_streamChatGemini`; **0.3** thinking-param migration; closing synthesis narration; persist `segmentIndex`+`narration` per tool.
- Modify `src/prompts/doctorChat.js` — add `<reasoning_discipline>`.
- Modify `src/controllers/doctorController.js` — pass `persona:'doctor'`; make `emit` resilient (try/catch).
- Create `scripts/testNarration.js`.

**Frontend (`cyborg-frontend`)**
- Create `src/utils/id.js` — `export const newId` (replaces the inline copies in concierge.js:7-10 and Chatbot.js:43-46).
- Create `src/stores/conciergeReducer.js` — `export createChatReducer({patchAssistant,onDone,onError})` (shared block-mutation cases incl. `narration`) AND `export hydrateMessage`.
- Create `src/components/concierge/NarrationRow.js` — the unified step row.
- Modify `src/stores/concierge.js` — use the shared reducer + shared `hydrateMessage`; supply store `onDone/onError`.
- Modify `src/components/concierge/Message.js` — render step rows (narration block pulls its matching tool block in as detail); import `NarrationRow`.
- Modify `src/components/concierge/ThinkingBlock.js` — bind to the final (no-tool) segment as a "reasoned before answering" affordance.
- Modify `src/components/Chatbot.js` (doctor) — import shared reducer/components/hydrate; supply doctor `onDone/onError`; delete dead code.

---

## Phase 0 — Unify the doctor fork + make thinking work on current models

### Task 0.1: Shared id util, reducer factory, and hydrate

**Files:**
- Create: `cyborg-frontend/src/utils/id.js`
- Create: `cyborg-frontend/src/stores/conciergeReducer.js`
- Modify: `cyborg-frontend/src/stores/concierge.js`

- [ ] **Step 1: `id.js`**
```js
// cyborg-frontend/src/utils/id.js
export const newId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

- [ ] **Step 2: Shared reducer factory** — Move ONLY the block-mutation cases out of the store. The factory takes `onDone`/`onError` callbacks (NOT zustand `set/get`, which the doctor host doesn't have).
```js
// cyborg-frontend/src/stores/conciergeReducer.js
import { newId } from "../utils/id";

export function createChatReducer({ patchAssistant, onDone, onError }) {
  return function onEvent(evt) {
    switch (evt.type) {
      case "textDelta":
        patchAssistant((m) => {
          const content = [...m.content];
          const last = content[content.length - 1];
          if (last && last.type === "text") content[content.length - 1] = { ...last, text: last.text + (evt.text || "") };
          else content.push({ type: "text", text: evt.text || "" });
          return { ...m, content };
        });
        break;

      case "narration": // step backbone — one step block per tool, keyed by unique toolIndex
        patchAssistant((m) => {
          const content = [...m.content];
          if (evt.phase === "end") {
            for (let i = content.length - 1; i >= 0; i--)
              if (content[i].type === "step" && content[i].toolIndex === evt.toolIndex) { content[i] = { ...content[i], endText: evt.text }; break; }
            return { ...m, content };
          }
          content.push({ type: "step", id: newId(), toolIndex: evt.toolIndex, segmentIndex: evt.segmentIndex,
                         name: evt.name, narrationText: evt.text, status: "pending" });
          return { ...m, content };
        });
        break;

      case "toolStart":
        patchAssistant((m) => {
          const content = [...m.content];
          // attach to the step pushed by narration(start); fall back to a bare step if narration missing
          let i = content.findIndex((b) => b.type === "step" && b.toolIndex === evt.toolIndex && b.status === "pending");
          if (i === -1) { content.push({ type: "step", id: newId(), toolIndex: evt.toolIndex, name: evt.name, status: "running", input: evt.input }); return { ...m, content }; }
          content[i] = { ...content[i], input: evt.input, status: "running" };
          return { ...m, content };
        });
        break;

      case "toolEnd":
        patchAssistant((m) => {
          const content = [...m.content];
          for (let i = content.length - 1; i >= 0; i--)
            if (content[i].type === "step" && content[i].toolIndex === evt.toolIndex) {
              content[i] = { ...content[i], status: evt.ok === false ? "error" : "done", result: evt.result, ok: evt.ok !== false }; break;
            }
          return { ...m, content };
        });
        break;

      case "thinkingDelta":
        patchAssistant((m) => {
          const segments = [...(m.thinking?.segments || [])];
          const idx = typeof evt.toolIndex === "number" ? evt.toolIndex : -1; // backend names this field toolIndex; it IS the segmentIndex
          const e = segments.findIndex((s) => s.toolIndex === idx);
          if (e === -1) segments.push({ toolIndex: idx, text: evt.text || "" });
          else segments[e] = { ...segments[e], text: segments[e].text + (evt.text || "") };
          segments.sort((a, b) => a.toolIndex - b.toolIndex);
          return { ...m, thinking: { segments, startedAt: m.thinking?.startedAt || Date.now() } };
        });
        break;

      case "thinkingUnsupported": break;
      case "done": onDone && onDone(evt); break;
      case "error": onError && onError(evt); break;
      default: break;
    }
  };
}
```
> Note: the existing `thinkingDelta` SSE field is literally named `toolIndex` (ai.js:219) but it carries the **segment** index. We keep the wire name but store it as the segment key; the renderer maps `step.segmentIndex → thissegment`.

- [ ] **Step 3: Export shared `hydrateMessage`** — Move `hydrateMessage` (currently private at concierge.js:12-54) into `conciergeReducer.js` as `export function hydrateMessage(raw){…}`, rebuilding **step** blocks from persisted `toolUses` (carrying `toolIndex`/`segmentIndex`/`narration`) interleaved with text, and `thinking.segments` from the persisted thinking map (unchanged). Have `concierge.js` import it.

- [ ] **Step 4: Use them in the store** — In `concierge.js`, import `{ createChatReducer, hydrateMessage }` and `{ newId }`; delete the inline `newId` (7-10) and inline `onEvent`. Build the reducer with store callbacks:
```js
const onEvent = createChatReducer({
  patchAssistant,
  onDone: () => { /* paste the existing done body: title derivation + chatOrder + streams set(...) AND the elapsedMs patchAssistant (concierge.js:283-327) */ },
  onError: (evt) => set((s) => ({ streams: { ...s.streams, [chatId]: { status: "error", error: evt.message || "stream error" } } })),
});
```

- [ ] **Step 5: Verify** — `npm run dev` in `cyborg-frontend`, open `/concierge`, send a message; confirm streaming text + tool steps + thinking render (no regressions).

- [ ] **Step 6: Commit**
```bash
git add cyborg-frontend/src/utils/id.js cyborg-frontend/src/stores/conciergeReducer.js cyborg-frontend/src/stores/concierge.js
git commit -m "refactor(concierge): shared reducer factory + hydrate + id util"
```

### Task 0.2: Point doctor `Chatbot.js` at the shared layer

**Files:** Modify `cyborg-frontend/src/components/Chatbot.js`; reuse `concierge/{Message,ThinkingBlock,ToolChip,Sources,NarrationRow}.js`, `stores/conciergeReducer.js`, `utils/id.js`.

- [ ] **Step 1: Reducer with doctor lifecycle** — Delete `handleEvent` (≈762-878). Add:
```js
const onEvent = useMemo(() => createChatReducer({
  patchAssistant,
  onDone: () => { patchAssistant((m) => m.thinking ? { ...m, thinking: { ...m.thinking, elapsedMs: m.thinking.startedAt ? Date.now() - m.thinking.startedAt : undefined } } : m); setStreaming(false); },
  onError: (evt) => { patchAssistant((m) => ({ ...m, content: [...m.content, { type: "text", text: `\n\n**Error:** ${evt.message || "Something went wrong. Please try again."}` }] })); setStreaming(false); },
}), [patchAssistant]);
```
Pass `onEvent` to `streamDoctorMessage` (≈924); update `handleSend` deps.

- [ ] **Step 2: Use shared render + hydrate** — Replace the local `MessageRow` usage with `<Message message={m} streaming={streaming && isLastAssistant} />`. Import `hydrateMessage` from the shared module and use it at the two call sites (≈677, ≈732). Import `newId` from `utils/id`.

- [ ] **Step 3: Delete now-dead code** — Remove the inline `ThinkingBlock` (234-308), `ToolChip` (314-378), `Sources` (423-463), `MessageRow` (469-551), `hydrateMessage` (557-599), `sanitiseJsonForDisplay` (48-56), `TOOL_META` (62-103), `markdownComponents`/`MarkdownBody`/`TypewriterMarkdown` (109-183), `thinkingMarkdownComponents` (189-232), and the `PERPLEXITY_TOOLS`/`deriveTitleFromUrl`/`extractCitationsFromResult` trio (384-421). Prune now-unused `lucide-react` imports (keep only those still referenced by remaining JSX: `ArrowUp, ArrowDown, Loader2, Sparkles, Plus, PanelLeftOpen, PanelLeftClose, Trash2, Users, User, MessageSquare`). Keep the doctor-specific sidebar/composer/init/switchChat/new/delete handlers untouched.

- [ ] **Step 4: Verify parity** — Open `/doctor/patients/<id>`, open the chat, send a message; confirm it renders identically to `/concierge` (step rows, thinking, sources) and a deliberate error still shows inline error text.

- [ ] **Step 5: Commit**
```bash
git add cyborg-frontend/src/components/Chatbot.js
git commit -m "refactor(doctor): reuse shared concierge chat (reducer + components + hydrate)"
```

### Task 0.3 (REQUIRED, before Phase 2): migrate Claude extended-thinking params

**Files:** Modify `cyborg-backend/src/providers/ai.js:200, 206-212, 269`.

- [ ] **Step 1: Confirm via claude-api skill** — Invoke `claude-api` to confirm the current extended-thinking shape. Known from review: the deprecated `thinking:{type:'enabled',budget_tokens}` + `interleaved-thinking-2025-05-14` beta **400s on Opus 4.7/4.8/Fable 5** (then the catch at ai.js:269 silently disables thinking); and adaptive thinking defaults `display:'omitted'` on Opus 4.8 → **empty** thinking text unless `display:'summarized'` is set.

- [ ] **Step 2: Apply** — Replace the ternary (ai.js:206-212):
```js
const stream = thinkingEnabled
  ? anthropic.messages.stream({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: process.env.THINKING_EFFORT || "high" },
      ...baseParams,
    })
  : anthropic.messages.stream(baseParams);
```
Drop `anthropic.beta.messages.stream`, the `betas:[…]` array, and `budget_tokens`. At ai.js:200 use a flat cap: `max_tokens: thinkingEnabled ? 16000 : 4096` (depth is governed by `effort`, not a budget). Keep `event.delta.thinking` handling (216-219) unchanged.

- [ ] **Step 3: Broaden the fallback matcher** — At ai.js:269 extend the predicate to also catch the new params so an older model still degrades gracefully: `... || msg.includes("adaptive") || msg.includes("effort") || msg.includes("output_config")`.

- [ ] **Step 4: Verify** — Set `CLAUDE_MODEL=claude-opus-4-8`, `ENABLE_THINKING=true`; send a concierge message; confirm `thinkingDelta` events stream with **non-empty** text (no `thinkingUnsupported`).

- [ ] **Step 5: Commit**
```bash
git add cyborg-backend/src/providers/ai.js
git commit -m "fix(ai): adaptive thinking with summarized display (works on Opus/Fable)"
```

---

## Phase 1 — Backend narration layer

### Task 1.1: Narration registry

**Files:** Create `cyborg-backend/src/services/toolNarration.js`.

- [ ] **Step 1: Registry (complete code)** — Same `START` tables as the design (concierge + doctor personas), with `narrateStart(name,input,persona='concierge')` (generic fallback for unknown tools) and:
```js
function narrateEnd(name, result) {
  if (!result || result.error) return null;
  switch (name) {
    case "getWearableData": return typeof result.daysFound === "number" ? `Reviewed ${result.daysFound} day(s) of wearable data.` : null;
    case "getMealData":     return typeof result.totalMeals === "number" ? `Looked over ${result.totalMeals} logged meal(s).` : null; // FIX: success returns totalMeals, not mealsFound
    case "recallMemories":  return typeof result.result_count === "number" ? `Recalled ${result.result_count} relevant note(s).` : (Array.isArray(result.results) ? `Recalled ${result.results.length} relevant note(s).` : null);
    case "searchChatHistory": { const n = result.resultCount ?? result.result_count ?? (Array.isArray(result.results) ? result.results.length : null); return n == null ? null : `Found ${n} related past chat(s).`; }
    case "searchMedicalEvidence":
    case "webSearch":       return Array.isArray(result.citations) ? `Pulled ${result.citations.length} source(s).` : null;
    case "saveMemory":      return result.saved ? "Saved." : null;
    default: return null;
  }
}
module.exports = { narrateStart, narrateEnd };
```

- [ ] **Step 2: Sanity-check + commit** — `node -e "const n=require('./src/services/toolNarration'); console.log(n.narrateStart('getMedicalData',{include:['reports']},'concierge'), '|', n.narrateEnd('getMealData',{totalMeals:5}))"` → `Pulling your latest lab panel… | Looked over 5 logged meal(s).`
```bash
git add cyborg-backend/src/services/toolNarration.js && git commit -m "feat(ai): tool narration registry"
```

### Task 1.2: Emit narration (Claude path) with dual index + persona + persistence

**Files:** Modify `cyborg-backend/src/providers/ai.js` (require at top; loop 241-250; thread persona at 153/161-164).

- [ ] **Step 1: Require + persona** — `const { narrateStart, narrateEnd } = require("../services/toolNarration");` Add `persona = "concierge"` to the `streamChatClaude` destructure (161-164).

- [ ] **Step 2: Replace ONLY ai.js:241-247 (keep line 250's increment)**
```js
// segmentIndex (ai.js:195) = toolCallCount - 1: the reasoning segment that produced THIS batch.
for (let bi = 0; bi < toolUseBlocks.length; bi++) {
  const toolUse = toolUseBlocks[bi];
  const toolIndex = toolCallCount + bi;            // unique per tool
  const startLine = narrateStart(toolUse.name, toolUse.input, persona);
  emit({ type: "narration", phase: "start", name: toolUse.name, toolIndex, segmentIndex, text: startLine });
  emit({ type: "toolStart", name: toolUse.name, input: toolUse.input, toolIndex });
  const result = await executeTool(toolUse.name, toolUse.input);
  emit({ type: "toolEnd", name: toolUse.name, ok: !result.error, result, toolIndex });
  const endLine = narrateEnd(toolUse.name, result);
  if (endLine) emit({ type: "narration", phase: "end", name: toolUse.name, toolIndex, text: endLine });
  allToolUses.push({ name: toolUse.name, input: toolUse.input, result, toolIndex, segmentIndex, narration: { start: startLine, end: endLine } });
  toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
}
// ⬇️ PRESERVE — do not delete (ai.js:250):
toolCallCount += toolUseBlocks.length;
```

- [ ] **Step 3: Closing synthesis step** — Just before the `end_turn` return (ai.js:232-235), if `allToolUses.length > 0`, emit a final step so the chain closes into the answer:
```js
emit({ type: "narration", phase: "start", name: "__synthesis", toolIndex: toolCallCount,
       segmentIndex: toolCallCount - 1, text: persona === "doctor" ? "Synthesizing the assessment…" : "Putting it together…" });
```
(The renderer shows this as a step with no tool body; its `segmentIndex` maps to the final pre-answer thinking segment.)

- [ ] **Step 4: Verify via smoke harness (Task 1.4) + commit**
```bash
git add cyborg-backend/src/providers/ai.js && git commit -m "feat(ai): emit narration + dual index (Claude path) + closing step"
```

### Task 1.3: Gemini path narration (own counter) + persona threading

**Files:** Modify `cyborg-backend/src/providers/ai.js:294, 298, 302, 308-310, 391-408`.

- [ ] **Step 1: Thread persona through Gemini (5 edits)** — Add `persona = "concierge"` to the `streamChatGemini` destructure (294) and `_streamChatGemini` destructure (308-310); forward `persona` in both `_streamChatGemini({…})` calls (298, 302).

- [ ] **Step 2: Add a tool counter + emit** — In `_streamChatGemini`, add `let toolStep = 0;` before the `while`. In the `for (const fc of pendingFunctionCalls)` loop (≈392):
```js
const toolIndex = toolStep++;
const startLine = narrateStart(fc.name, fc.args, persona);
emit({ type: "narration", phase: "start", name: fc.name, toolIndex, segmentIndex: -1, text: startLine });
emit({ type: "toolStart", name: fc.name, input: fc.args, toolIndex });
// ... existing executeTool ...
emit({ type: "toolEnd", name: fc.name, ok: !result.error, result, toolIndex });
const endLine = narrateEnd(fc.name, result);
if (endLine) emit({ type: "narration", phase: "end", name: fc.name, toolIndex, text: endLine });
allToolUses.push({ name: fc.name, input: fc.args, result, toolIndex, segmentIndex: -1, narration: { start: startLine, end: endLine } });
```
(Gemini has no thinking → `segmentIndex:-1` is unused but keeps the shape uniform.)

- [ ] **Step 3: Verify** — Set `AI_PROVIDER=gemini`, send a message that triggers a tool; confirm narration start/end stream with monotonic `toolIndex`. Then restore `AI_PROVIDER=claude`. Commit.
```bash
git add cyborg-backend/src/providers/ai.js && git commit -m "feat(ai): provider-independent narration on Gemini path"
```

### Task 1.4: Doctor prompt parity, persona pass, resilient emit, persist + smoke test

**Files:** `doctorChat.js`; `doctorController.js:402-406, 409-420`; `scripts/testNarration.js`.

- [ ] **Step 1: `<reasoning_discipline>` block** in `doctorChat.js` (peer-consultant register; mirrors chat.js:152-183; do not restate the system step label, no raw JSON/ids, no meta-commentary in the answer).
- [ ] **Step 2: Pass persona** — add `persona: "doctor"` to the `doctorController.js` streamChat call (409-420).
- [ ] **Step 3: Resilient doctor emit** — wrap the `doctorController.js:402-406` emit body in `try { … } catch {}` (mirror chatController.js:247-255) so the doubled narration writes can't abort the loop on disconnect.
- [ ] **Step 4: Persistence is free** — `toolUses` is `Mixed` (Chat.js:5-6), so the added `toolIndex`/`segmentIndex`/`narration` survive `chat.messages.push(...)`. Confirm by inspecting a saved chat doc.
- [ ] **Step 5: Smoke test** — write `scripts/testNarration.js` (asserts `narrateStart` non-empty for concierge+doctor and `narrateEnd('getMealData',{totalMeals:2})==='Looked over 2 logged meal(s).'`), run it (exit 0), commit.
```bash
git add cyborg-backend/src/prompts/doctorChat.js cyborg-backend/src/controllers/doctorController.js cyborg-backend/scripts/testNarration.js
git commit -m "feat(doctor): reasoning parity + doctor persona + resilient emit + narration smoke test"
```

---

## Phase 2 — Frontend chained step rows (lands on both views via Phase 0)

### Task 2.1: NarrationRow — the unified step

**Files:** Create `cyborg-frontend/src/components/concierge/NarrationRow.js`.

- [ ] **Step 1:** Render one step: icon + `block.narrationText`; a live pulse while `block.status==='running'`; `· endText` when present; a chevron expanding BOTH the real reasoning (`thinkingText`) and the raw tool I/O (reuse `ToolChip` as the detail body when `block.input/result` exist).
```jsx
import { useState } from "react";
import { Sparkles, ChevronRight } from "lucide-react";
import ToolChip from "./ToolChip";
export default function NarrationRow({ block, thinkingText }) {
  const [open, setOpen] = useState(false);
  const hasDetail = thinkingText || block.input || block.result;
  return (
    <div className="my-1">
      <button onClick={() => hasDetail && setOpen((o) => !o)} className="flex items-center gap-2 text-sm text-gray-500">
        <Sparkles className={`h-3.5 w-3.5 text-violet-400 ${block.status === "running" ? "animate-pulse" : ""}`} />
        <span>{block.narrationText}</span>
        {block.endText && <span className="text-gray-400">· {block.endText}</span>}
        {hasDetail && <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />}
      </button>
      {open && (
        <div className="ml-5 mt-1 border-l-2 border-violet-200 pl-3 space-y-2">
          {thinkingText && <div className="text-xs italic text-gray-400 whitespace-pre-wrap">{thinkingText}</div>}
          {(block.input || block.result) && <ToolChip block={{ type: "tool", name: block.name, input: block.input, result: block.result, status: block.status, ok: block.ok }} />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add cyborg-frontend/src/components/concierge/NarrationRow.js && git commit -m "feat(concierge): unified narration step row"
```

### Task 2.2: Render the chain in Message.js

**Files:** Modify `cyborg-frontend/src/components/concierge/Message.js` (import at 5-7; content map 134-153).

- [ ] **Step 1: Import** — add `import NarrationRow from "./NarrationRow";`.
- [ ] **Step 2: Map thinking by segment + render steps**
```jsx
const segs = message.thinking?.segments || [];
const thinkingBySegment = Object.fromEntries(segs.map((s) => [s.toolIndex, s.text])); // s.toolIndex IS the segment key
const maxStepSeg = Math.max(-2, ...message.content.filter((b) => b.type === "step").map((b) => b.segmentIndex ?? -2));
// in content.map:
if (block.type === "step") return <NarrationRow key={block.id} block={block} thinkingText={thinkingBySegment[block.segmentIndex]} />;
if (block.type === "text") { /* existing markdown + typewriter — UNCHANGED (isLastText filters type==='text', invariant to step blocks) */ }
```
- [ ] **Step 3: Final reasoning row** — After the content map, if a thinking segment exists whose key `> maxStepSeg` (the post-last-tool reasoning), render it as a closing reasoning affordance just above the answer (or bind the slimmed `ThinkingBlock` to it — Task 2.3). This restores the closing "reason" before the answer.
- [ ] **Step 4: Verify the chain** — send "How's my recovery vs my goals?"; confirm order: step(narration+pulse→tool detail→why) → step → … → closing reason → answer. Repeat on `/doctor/patients/<id>` (free via Phase 0). Single-tool turn: confirm the first step shows the pre-tool reasoning (segment -1), not the next turn's.
- [ ] **Step 5: Commit**
```bash
git add cyborg-frontend/src/components/concierge/Message.js && git commit -m "feat(concierge): render chained step timeline with real-thinking enrichment"
```

### Task 2.3: Slim ThinkingBlock to the closing segment + replay on reload

**Files:** Modify `ThinkingBlock.js`; ensure shared `hydrateMessage` rebuilds steps.

- [ ] **Step 1: Bind ThinkingBlock to the final segment** — Remove the live single-segment ticker (65-85); render only the highest-keyed thinking segment (the one with no step) as a quiet "Reasoned before answering · Xs" expander above the answer. The inline `NarrationRow`s are now the live reasoning surface.
- [ ] **Step 2: Replay** — Confirm shared `hydrateMessage` (Task 0.1 Step 3) rebuilds `step` blocks from `toolUses` (carrying `toolIndex`/`segmentIndex`/`narration{start,end}`) interleaved with text, and `thinking.segments` from the persisted map — so a refreshed chat replays the full chain with per-step thinking. Verify by refreshing a past chat on both views.
- [ ] **Step 3: Commit**
```bash
git add cyborg-frontend/src/components/concierge/ThinkingBlock.js
git commit -m "feat(concierge): closing-segment ThinkingBlock + chain replay on reload"
```

---

## Phase 3 — Polish (optional)

- **3.1 Second-brain identity framing** — add digital-twin framing to `chat.js:5-13` + `doctorChat.js` identity; sample replies to confirm tone otherwise unchanged.
- **3.2 Result-summary cards** — promote selected `narrateEnd` lines (wearable/labs) into a one-line finding card under the step. *(The live "working…" pulse was promoted into Task 2.1.)*

---

## Self-Review (v2)

- **Index contract** is documented once at the top and used consistently: narration carries `toolIndex` (unique, pairing) + `segmentIndex` (shared, thinking). Render maps thinking by `segmentIndex`; closing segment handled (Task 2.2 Step 3 / 2.3). **This corrects the v1 off-by-one the review caught.**
- **Thinking actually appears:** `display:"summarized"` set (0.3), required + ordered before Phase 2.
- **Shared layer is real:** `newId` (utils/id.js) and `hydrateMessage` are exported and imported by store + doctor; the factory uses `onDone/onError` (no zustand `set/get` leak) so the doctor host doesn't crash on `done`.
- **Both providers:** Gemini path has its own counter (1.3); persona threaded through 5 edits.
- **Persistence/replay:** `toolIndex`/`segmentIndex`/`narration` persisted in `toolUses` (Mixed) and rebuilt in hydrate.
- **Correctness nits fixed:** `getMealData`→`totalMeals`; `toolCallCount += …` explicitly preserved; tool events stamped with `toolIndex` (robust pairing, parallel-tool safe); resilient doctor emit; dead-code list for Chatbot.js.
- **Verified-correct (not changed):** `toolUses` is `Mixed`; `sse.js` forwards unknown events; typewriter `isLastText` is invariant to step blocks; `ToolChip` 12-tool labels fix the doctor TOOL_META drift; `patchAssistant` signature compatible across hosts.
- **Known follow-up (non-blocking):** `SchemaInfo.sampleCount` vs builder `documentCount` (cosmetic).
